/**
 * Follow me's controller (docs/READER_STATE_API.md, "Follow me"): owns the one follow session this tab may be in — opening the room,
 * the session client over it, what sessionStorage keeps for a reload, and tearing it all down. Not React: FollowUi and Share's entry read
 * getState() through useSyncExternalStore and call the commands.
 *
 * Where the room lives:
 *  - PUBLIC_ROOM_URL set: a WebSocket to `<roomUrl>/r/<sessionId>` (scripts/dev-room-server.mjs locally, later the relay). The transport
 *    reconnects itself; the session client re-joins and resyncs.
 *  - Otherwise the in-browser room (src/lib/session/local-room.ts): the host tab runs the room and its own client uses connectSelf(); other
 *    tabs connectLocalRoom(). That transport does not reconnect — a closed BroadcastChannel stays closed — so a guest whose room went away
 *    (the host reloaded: a new room in the same tab, under the same session id) builds a fresh connection and client here, a few times.
 *
 * The host closes its room on pagehide, so guests learn at once that it went (instead of after the 70 s silence) and start retrying.
 *
 * This module, the session client and the transports load only when follow me is used (FollowUi imports them dynamically); the
 * in-browser room is passed in (`localRoom`) so it is not even loaded when a room server is configured.
 */
import { createWebSocketTransport } from "~/lib/reader-state/core/transports/websocket";
import type { ReaderStateApi, StateTransport } from "~/lib/reader-state/core/types";
import { createSessionClient, type SessionClient, type SessionClientOptions } from "~/lib/session/client";
import { newParticipantId, newSessionId } from "~/lib/session/ids";
import { parseRoomEnvelope } from "~/lib/session/incoming";
import type * as LocalRoomModule from "~/lib/session/local-room";
import type { AnyEnvelope, Participant, ParticipantId } from "~/lib/session/protocol";
import type { FollowMeSource, FollowMeState } from "~/ui/ShareView/follow-me";
import { clearStoredFollow, guestName, roomSocketUrl, withFollowParam, writeStoredFollow, type StoredFollow } from "./params";

export { roomSocketUrl };

/** The in-browser room's two entry points (src/lib/session/local-room.ts), loaded only when no room server is configured. */
export type LocalRoom = Pick<typeof LocalRoomModule, "connectLocalRoom" | "hostLocalRoom">;

export type FollowRole = StoredFollow["role"];

export interface FollowConnection {
  transport: StateTransport<AnyEnvelope>;
  /** Close everything this connection opened (for the host in local mode: the room itself). */
  close(): void;
  /** Does this transport reconnect on its own? (WebSocket yes; the in-browser room no, so the controller rebuilds it.) */
  reconnects: boolean;
}

export interface FollowSession {
  sessionId: string;
  role: FollowRole;
  client: SessionClient;
}

export interface FollowControllerState {
  session: FollowSession | null;
  /** Each participant's latest address, from their stream: what "Dana is reading Exodus 3" names. */
  locations: Readonly<Record<ParticipantId, string>>;
  /** The room could not be reached again after it went away (in-browser room only); shown until dismissed. */
  lost: boolean;
}

export interface FollowControllerOptions {
  api: ReaderStateApi;
  /** PUBLIC_ROOM_URL; empty for the in-browser room. */
  roomUrl?: string;
  /** The in-browser room (needed when roomUrl is not a ws:/wss: URL and `connect` is not given). */
  localRoom?: LocalRoom;
  storage?: Storage | null;
  /** The signed-in reader's display name, read when joining; a guest name otherwise. */
  viewerName?: () => string | null | undefined;
  /** Open a connection to a room (tests substitute a fake). */
  connect?: (sessionId: string, role: FollowRole) => FollowConnection;
  createClient?: (opts: SessionClientOptions) => SessionClient;
  /** Delay before rebuilding a lost in-browser room connection, and how many times (≈ 2 minutes with the 5 s connect timeout). */
  retryMs?: number;
  maxRetries?: number;
}

export interface FollowController {
  getState(): FollowControllerState;
  subscribe(cb: () => void): () => void;
  /** Open a new session in this tab and lead it. Returns its id. Leaves any session this tab was in. */
  startSharing(): string;
  /** Join someone's session (a `follow` link) as a participant who follows the spotlight. */
  join(sessionId: string): void;
  /** After a reload: host or join again what sessionStorage kept. */
  resume(stored: StoredFollow): void;
  /** Stop following / leave: the reader stays where it is. */
  leave(): void;
  /** Host: end the session for everyone. */
  endSharing(): void;
  /** Close the bar after the session ended or was lost. */
  dismiss(): void;
  /** Share's "Follow me" entry, backed by this controller. */
  readonly followMe: FollowMeSource;
  dispose(): void;
}

const DEFAULT_RETRY_MS = 1_500;
const DEFAULT_MAX_RETRIES = 20;

export function defaultConnect(roomUrl: string | undefined, localRoom?: LocalRoom): (sessionId: string, role: FollowRole) => FollowConnection {
  return (sessionId, role) => {
    const socketUrl = roomSocketUrl(roomUrl, sessionId);
    if (socketUrl) {
      const transport = createWebSocketTransport<AnyEnvelope>(socketUrl);
      return { transport, close: () => transport.close(), reconnects: true };
    }
    if (!localRoom) throw new Error("follow: no room server is configured and the in-browser room was not loaded");
    if (role === "guest") {
      const transport = localRoom.connectLocalRoom(sessionId);
      return { transport, close: () => transport.close(), reconnects: false };
    }
    const room = localRoom.hostLocalRoom(sessionId);
    const closeRoom = () => room.close();
    if (typeof window !== "undefined") window.addEventListener("pagehide", closeRoom);
    return {
      transport: room.connectSelf(),
      close() {
        if (typeof window !== "undefined") window.removeEventListener("pagehide", closeRoom);
        room.close();
      },
      reconnects: false,
    };
  };
}

export function createFollowController(opts: FollowControllerOptions): FollowController {
  const { api, storage = null } = opts;
  const connect = opts.connect ?? defaultConnect(opts.roomUrl, opts.localRoom);
  const createClient = opts.createClient ?? createSessionClient;
  const retryMs = opts.retryMs ?? DEFAULT_RETRY_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

  let state: FollowControllerState = { session: null, locations: {}, lost: false };
  const listeners = new Set<() => void>();
  /** Teardown of the current connection, client subscription and retry timer. */
  let teardown: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;

  function set(patch: Partial<FollowControllerState>) {
    state = { ...state, ...patch };
    emit();
  }
  function emit() {
    followMeState = computeFollowMe();
    for (const cb of [...listeners]) cb();
  }

  function selfFor(stored: StoredFollow): Participant {
    const name = opts.viewerName?.()?.trim() || guestName(stored.participantId);
    return { id: stored.participantId, name, isHost: stored.role === "host", canLead: true };
  }

  function drop() {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    teardown?.();
    teardown = null;
  }

  /** Connect and build a client for `stored`; `fresh` (a new session) also asks for the spotlight once the room answers. */
  function open(stored: StoredFollow, fresh: boolean) {
    drop();
    const conn = connect(stored.sessionId, stored.role);
    const client = createClient({ api, transport: conn.transport, self: selfFor(stored) });
    const offs: (() => void)[] = [];
    let askedSpotlight = !fresh || stored.role !== "host";

    // The streams that reach this tab (the spotlight's, and any it follows); keep only each one's address, for the "is reading" label.
    // Checked like everything else from the transport (./incoming.ts), never read as the shape it claims.
    offs.push(
      conn.transport.onMessage((raw) => {
        const env = parseRoomEnvelope(raw);
        if (!env || env.ch !== "state" || env.from === undefined) return;
        const body = env.body;
        const url = body.type === "keyframe" ? body.snapshot.url : body.type === "change" ? body.change.url : undefined;
        if (typeof url !== "string" || state.locations[env.from] === url) return;
        set({ locations: { ...state.locations, [env.from]: url } });
      }),
    );

    offs.push(
      client.subscribe(() => {
        const s = client.getState();
        if (s.status !== "connecting" && s.status !== "reconnecting") retries = 0;
        if (!askedSpotlight && s.status !== "connecting" && s.status !== "reconnecting" && s.status !== "ended") {
          askedSpotlight = true;
          if (s.room.spotlight !== s.self.id) client.spotlight(s.self.id);
        }
        if (s.status === "ended") {
          clearStoredFollow(storage);
          // The host's own session ending needs no "stopped sharing" bar: they pressed Stop.
          if (stored.role === "host") {
            drop();
            set({ session: null, locations: {} });
            return;
          }
        }
        emit();
      }),
    );

    if (!conn.reconnects) {
      offs.push(
        conn.transport.onStatus((status) => {
          if (status !== "closed" || client.getState().status === "ended") return;
          scheduleRetry(stored);
        }),
      );
      // Born closed (no BroadcastChannel) or closed before we subscribed.
      if (conn.transport.status === "closed") queueMicrotask(() => client.getState().status !== "ended" && scheduleRetry(stored));
    }

    teardown = () => {
      for (const off of offs.splice(0)) off();
      client.stop();
      conn.close();
    };
    set({ session: { sessionId: stored.sessionId, role: stored.role, client }, lost: false });
  }

  function scheduleRetry(stored: StoredFollow) {
    if (retryTimer !== undefined) return;
    if (retries >= maxRetries) {
      drop();
      clearStoredFollow(storage);
      set({ session: null, lost: true });
      return;
    }
    retries += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (state.session?.sessionId === stored.sessionId) open(stored, false);
    }, retryMs);
  }

  function begin(stored: StoredFollow, fresh: boolean) {
    retries = 0;
    writeStoredFollow(storage, stored);
    set({ locations: {} });
    open(stored, fresh);
  }

  function computeFollowMe(): FollowMeState {
    const session = state.session;
    if (!session) return { status: "idle", following: 0 };
    if (session.role === "guest") return { status: "busy", following: 0 };
    const s = session.client.getState();
    if (s.status === "ended") return { status: "idle", following: 0 };
    const following = s.participants.filter((p) => p.id !== s.self.id && p.following === s.self.id).length;
    return { status: s.status === "connecting" ? "starting" : "sharing", following };
  }
  let followMeState = computeFollowMe();

  const controller: FollowController = {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    startSharing() {
      const sessionId = newSessionId();
      begin({ sessionId, role: "host", participantId: newParticipantId() }, true);
      return sessionId;
    },
    join(sessionId) {
      if (state.session?.sessionId === sessionId && state.session.client.getState().status !== "ended") return;
      begin({ sessionId, role: "guest", participantId: newParticipantId() }, false);
    },
    resume(stored) {
      if (state.session?.sessionId === stored.sessionId && state.session.client.getState().status !== "ended") return;
      begin(stored, false);
    },
    leave() {
      drop();
      clearStoredFollow(storage);
      set({ session: null, locations: {}, lost: false });
    },
    endSharing() {
      const session = state.session;
      if (!session) return;
      if (session.role !== "host") return controller.leave();
      session.client.end();
      // If the room never answers (already gone), do not leave the host stuck sharing.
      setTimeout(() => {
        if (state.session === session) controller.leave();
      }, 2_000);
    },
    dismiss() {
      if (state.session && state.session.client.getState().status !== "ended") return;
      drop();
      set({ session: null, locations: {}, lost: false });
    },
    followMe: {
      getState: () => followMeState,
      subscribe: (cb) => controller.subscribe(cb),
      start: () => void controller.startSharing(),
      stop: () => controller.endSharing(),
      linkFor: (url) => (state.session?.role === "host" ? withFollowParam(url, state.session.sessionId) : null),
    },
    dispose() {
      drop();
      listeners.clear();
    },
  };
  return controller;
}
