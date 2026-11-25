/**
 * The room in a tab: follow without a backend. The host's tab runs `createRoom` and serves it over a BroadcastChannel named
 * "sefaria-room:<sessionId>"; other tabs of the same browser reach it with `connectLocalRoom`. Used for local development, e2e tests, and
 * as the fallback when no PUBLIC_ROOM_URL is configured.
 *
 * Frames ride on the core's BroadcastChannel transport (JSON text, tagged), which every tab on the channel sees, so each frame is addressed:
 *   tab → room   { to: "room", conn, envelope? | ping? | bye? }
 *   room → tabs  { to: conn | "all", except?, envelope? | pong? | closed? }
 * A BroadcastChannel cannot tell when a tab goes away, so tabs say "bye" on close and pagehide, and ping now and then; the room drops a
 * connection it has not heard from in a while (generously: background tabs' timers are throttled to once a minute).
 *
 * SSR-safe: nothing runs at import time, and where BroadcastChannel does not exist the transports are born closed.
 */
import type { StateTransport, TransportStatus } from "~/lib/reader-state/core/types";
import { createBroadcastChannelTransport } from "~/lib/reader-state/core/transports/broadcast-channel";
import { createMemoryPair } from "~/lib/reader-state/core/transports/memory";
import { createListeners } from "~/lib/reader-state/core/transports/listeners";
import type { AnyEnvelope } from "./protocol";
import { createRoom, type ConnId, type Outgoing, type Room } from "./room";

export const channelName = (sessionId: string) => `sefaria-room:${sessionId}`;

/** A tab that has said nothing for this long is gone (longer than Chrome's one-minute timer throttling of hidden tabs). */
export const DEAD_AFTER_MS = 70_000;
/** How often a tab pings the room (and the room's silence that closes a tab's transport is DEAD_AFTER_MS). */
export const PING_EVERY_MS = 20_000;
/** A tab gives up if no room answers its first message within this. */
export const CONNECT_TIMEOUT_MS = 5_000;
export const TICK_MS = 1_000;

interface ClientFrame {
  to: "room";
  conn: ConnId;
  envelope?: unknown;
  ping?: true;
  bye?: true;
}

interface RoomFrame {
  to: ConnId | "all";
  except?: ConnId;
  envelope?: AnyEnvelope;
  pong?: true;
  closed?: true;
}

type Frame = ClientFrame | RoomFrame;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

/** Ids that work outside secure contexts too (crypto.randomUUID needs https; a LAN dev host is plain http). */
function randomId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface LocalRoomHost {
  /** An in-memory connection for the host tab's own session client. */
  connectSelf(): StateTransport<AnyEnvelope>;
  /** Stop serving: every tab is told the room closed. */
  close(): void;
  /** The room, for tests and debugging. */
  readonly room: Room;
}

export function hostLocalRoom(sessionId: string, { now = Date.now }: { now?: () => number } = {}): LocalRoomHost {
  const room = createRoom({ now });
  const channel = createBroadcastChannelTransport<Frame>(channelName(sessionId), { selfId: randomId("room-") });
  /** Remote tabs' connections and when we last heard from each. */
  const lastSeen = new Map<ConnId, number>();
  /** The host tab's own connections: their room-side ends. */
  const selves = new Map<ConnId, StateTransport<AnyEnvelope>>();
  let closed = false;

  function post(frame: RoomFrame) {
    channel.send(frame);
  }

  function deliver(out: Outgoing[]) {
    if (closed) return;
    for (const { to, envelope } of out) {
      // Own connections, in memory.
      for (const id of room.recipients(to)) selves.get(id)?.send(envelope);
      // Remote tabs, in one post per message: every tab sees it and keeps what is addressed to it.
      if (to === "all") {
        post({ to: "all", envelope });
      } else if (typeof to === "string") {
        if (!selves.has(to)) post({ to, envelope });
      } else {
        post({ to: "all", except: to.except, envelope });
      }
    }
  }

  function dropConn(conn: ConnId) {
    lastSeen.delete(conn);
    deliver(room.disconnect(conn));
  }

  channel.onMessage((frame) => {
    if (closed || !isObj(frame) || frame.to !== "room") return;
    const { conn } = frame as ClientFrame;
    if (typeof conn !== "string" || conn.length === 0 || conn.length > 128 || conn === "all" || selves.has(conn)) return;
    const f = frame as ClientFrame;
    if (f.bye) {
      if (lastSeen.has(conn)) dropConn(conn);
      return;
    }
    if (!lastSeen.has(conn)) room.connect(conn);
    lastSeen.set(conn, now());
    if (f.ping) post({ to: conn, pong: true });
    if (f.envelope !== undefined) deliver(room.handle(conn, f.envelope));
  });

  const timer = setInterval(() => {
    if (closed) return;
    const t = now();
    for (const [conn, seen] of [...lastSeen]) if (t - seen > DEAD_AFTER_MS) dropConn(conn);
    deliver(room.tick());
  }, TICK_MS);

  return {
    room,
    connectSelf() {
      const [roomEnd, clientEnd] = createMemoryPair<AnyEnvelope>();
      if (closed) {
        clientEnd.close();
        return clientEnd;
      }
      const conn = randomId("self-");
      selves.set(conn, roomEnd);
      room.connect(conn);
      roomEnd.onMessage((envelope) => deliver(room.handle(conn, envelope)));
      roomEnd.onStatus((status) => {
        if (status !== "closed" || !selves.has(conn)) return;
        selves.delete(conn);
        deliver(room.disconnect(conn));
      });
      return clientEnd;
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      post({ to: "all", closed: true });
      for (const end of [...selves.values()]) end.close();
      selves.clear();
      channel.close();
    },
  };
}

/**
 * A tab's connection to a room hosted in another tab. "connecting" until the room answers (the reply to a probe sent at once, or the
 * reply to a join), "closed" if the room says it closed, nothing answers within CONNECT_TIMEOUT_MS, or the room falls silent.
 *
 * It opens on any answer, not only a join's, because a session client sends its join once the transport is open.
 */
export function connectLocalRoom(sessionId: string, { now = Date.now }: { now?: () => number } = {}): StateTransport<AnyEnvelope> {
  const conn = randomId("tab-");
  const messages = createListeners<AnyEnvelope>();
  const statuses = createListeners<TransportStatus>();
  const channel = createBroadcastChannelTransport<Frame>(channelName(sessionId), { selfId: conn });
  let status: TransportStatus = channel.status === "closed" ? "closed" : "connecting";
  /** Set once the room has addressed us directly with an envelope (our join's answer): broadcasts are for members only. */
  let inRoom = false;
  let lastHeard = now();
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;

  const post = (frame: Omit<ClientFrame, "to" | "conn">) => channel.send({ to: "room", conn, ...frame });

  function setStatus(next: TransportStatus) {
    if (status === next) return;
    status = next;
    statuses.emit(next);
  }

  function shutdown(sayBye: boolean) {
    if (status === "closed" && !pingTimer && !connectTimer) return;
    if (sayBye) post({ bye: true });
    clearInterval(pingTimer);
    clearTimeout(connectTimer);
    pingTimer = connectTimer = undefined;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
    channel.close();
    setStatus("closed");
    messages.clear();
  }

  function onPageHide() {
    shutdown(true);
  }

  if (status === "connecting") {
    channel.onMessage((frame) => {
      if (!isObj(frame) || frame.to === "room") return;
      const f = frame as RoomFrame;
      const direct = f.to === conn;
      if (!direct && !(f.to === "all" && f.except !== conn)) return;
      lastHeard = now();
      if (f.closed) {
        shutdown(false);
        return;
      }
      if (direct && status === "connecting") {
        clearTimeout(connectTimer);
        connectTimer = undefined;
        setStatus("open");
      }
      if (f.envelope === undefined) return;
      if (direct) inRoom = true;
      if (direct || inRoom) messages.emit(f.envelope);
    });
    post({ ping: true });
    connectTimer = setTimeout(() => {
      connectTimer = undefined;
      if (status === "connecting") shutdown(false);
    }, CONNECT_TIMEOUT_MS);
    pingTimer = setInterval(() => {
      if (now() - lastHeard > DEAD_AFTER_MS) shutdown(false);
      else post({ ping: true });
    }, PING_EVERY_MS);
    if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);
  }

  return {
    send(msg) {
      if (status === "closed") return;
      post({ envelope: msg });
    },
    onMessage: (cb) => messages.add(cb),
    onStatus: (cb) => statuses.add(cb),
    get status() {
      return status;
    },
    close() {
      shutdown(true);
    },
  };
}
