/**
 * The room client (docs/READER_STATE_API.md, "Follow me" and "Sessions"): one per open follow session. It publishes this reader's own
 * stream to the room, follows someone else's (the spotlight holder, or a participant the person picked), and lets the person break away
 * and come back — all over one transport carrying the room protocol (./protocol.ts).
 *
 * It is a small observable controller, not React: the follow UI reads getState() through useSyncExternalStore and calls the commands.
 * Everything that decides *who may* (spotlight permission, terms, resync answers) is the room's job; this side only reacts to what the
 * room says — after checking it (./incoming.ts): nothing from the transport is trusted as the shape it claims.
 *
 * Its own stream goes out only while someone needs it — this reader holds the spotlight, or a participant's presence says they follow it —
 * and through ./outgoing.ts, which keeps search and sign-in pages and search words home. A guest who broke away and wandered off is not
 * broadcasting where they went.
 */
import { createStreamReader, createStreamWriter } from "~/lib/reader-state/core/stream";
import type {
  ApplyContext,
  ReaderStateApi,
  RestoreWarning,
  StateTransport,
  StreamMessage,
  StreamReader,
  StreamWriter,
  StreamWriterOptions,
  TransportStatus,
} from "~/lib/reader-state/core/types";
import {
  PROTOCOL_VERSION,
  type AnyEnvelope,
  type ControlMessage,
  type Envelope,
  type LeadershipMode,
  type Participant,
  type ParticipantId,
  type PresenceMessage,
  type StateChannelMessage,
} from "./protocol";
import { parseRoomEnvelope } from "./incoming";
import { publicView } from "./outgoing";

export type SessionStatus =
  /** Before the transport first opens and the room first describes itself. */
  | "connecting"
  /** Following someone; their moves are applied as they come. */
  | "live"
  /** The person broke away: messages are folded, not applied, until followAgain(). */
  | "paused"
  /** Whoever is followed is away (tab hidden) or not in the room; the reader stays put. */
  | "leader-away"
  /** Nobody holds the spotlight and nobody was picked. */
  | "no-leader"
  /** The transport dropped after having been open; on reopen the client re-joins and resyncs. */
  | "reconnecting"
  /** The room ended or stop() was called. Terminal. */
  | "ended"
  /** This person holds the spotlight (and has not picked someone to follow). */
  | "leading";

export interface RoomState {
  spotlight: ParticipantId | null;
  term: number;
  mode: LeadershipMode;
  hands: ParticipantId[];
  ended: boolean;
}

export type PresentParticipant = Participant & { following: ParticipantId | null; away: boolean };

export interface SessionState {
  status: SessionStatus;
  room: RoomState;
  participants: PresentParticipant[];
  /** Whose stream is being followed now (picked, else the spotlight holder); null when nobody (or self leads). */
  following: ParticipantId | null;
  /** The participant the person picked with follow(id); null means "follow the spotlight". */
  chosen: ParticipantId | null;
  self: Participant;
  /** Warnings from the last apply (e.g. 102: the follower cannot see what the leader opened). */
  warnings: RestoreWarning[];
  /** The last control message the room refused. */
  refused: { of: string; reason: string } | null;
}

export interface SessionClient {
  getState(): SessionState;
  subscribe(cb: () => void): () => void;
  /** Follow a participant; null follows the spotlight holder again. Goes live at once. */
  follow(participantId: ParticipantId | null): void;
  /** After breaking away: apply the held state at once (no round trip) and continue applying. */
  followAgain(): void;
  /** Ask the room to move the spotlight (it checks permission). */
  spotlight(to: ParticipantId | null): void;
  raiseHand(): void;
  setMode(mode: LeadershipMode): void;
  /** Ask the room to end the session for everyone (host). */
  end(): void;
  /** Leave: tell the room, close the transport. The reader stays where it is. */
  stop(): void;
}

export interface StreamFactories {
  createStreamWriter(api: ReaderStateApi, opts?: StreamWriterOptions): StreamWriter;
  createStreamReader(api: ReaderStateApi, ctx: ApplyContext): StreamReader;
}

export interface SessionClientOptions {
  api: ReaderStateApi;
  transport: StateTransport<AnyEnvelope>;
  self: Participant;
  /** Injected clock for the stream writer (ms). */
  now?: () => number;
  /** Sent in `hello` ("sefaria-reader@<version>"). */
  clientName?: string;
  /** Stream writer/reader factories; default: the core's. Tests may substitute. */
  streams?: StreamFactories;
}

/** Follow streams scroll at most 10 times a second (READER_STATE_API.md, "Streams"). */
const FOLLOW_SCROLL_SAMPLE_MS = 100;
const FOLLOW_APPLY: ApplyContext = { origin: "follow", persist: false };

const INITIAL_ROOM: RoomState = { spotlight: null, term: 0, mode: "presenter", hands: [], ended: false };

export function createSessionClient(opts: SessionClientOptions): SessionClient {
  const { api, transport, self } = opts;
  const streams: StreamFactories = opts.streams ?? { createStreamWriter, createStreamReader };
  const clientName = opts.clientName ?? "sefaria-reader";
  /** What the writer reads: the API with private pages and search words filtered out. */
  const outgoing = publicView(api);

  let room: RoomState = INITIAL_ROOM;
  /** Have we heard the room describe itself since the transport (re)opened? Until then the status stays connecting/reconnecting. */
  let roomKnown = false;
  let participants: PresentParticipant[] = [];
  let participantsKnown = false;
  let chosen: ParticipantId | null = null;
  /** Broke away from following. Survives a spotlight change (a new leader does not drag back someone who wandered off). */
  let paused = false;
  let wasOpen = false;
  let ended = false;
  let away = typeof document !== "undefined" && document.visibilityState === "hidden";
  let warnings: RestoreWarning[] = [];
  let refused: SessionState["refused"] = null;

  let writer: StreamWriter | null = null;
  /** The stream reader for `readerOf`; replaced whenever the target changes, so one stream never folds onto another's state. */
  let reader: StreamReader | null = null;
  let readerOf: ParticipantId | null = null;
  let offGap: (() => void) | null = null;
  let lastPresence: string | null = null;

  const listeners = new Set<() => void>();
  let state: SessionState = buildState();

  // ── Derived state ──────────────────────────────────────────────────────────────────────────────────────────

  /** Whom to follow: the person's pick, else the spotlight holder — never self. */
  function target(): ParticipantId | null {
    const t = chosen ?? room.spotlight;
    return t === self.id ? null : t;
  }

  function isLeading(): boolean {
    return chosen === null && room.spotlight === self.id;
  }

  function targetAway(t: ParticipantId): boolean {
    if (!participantsKnown) return false;
    const p = participants.find((x) => x.id === t);
    return !p || p.away;
  }

  function computeStatus(): SessionStatus {
    if (ended) return "ended";
    if (transport.status !== "open") return wasOpen ? "reconnecting" : "connecting";
    if (!roomKnown) return wasOpen && room !== INITIAL_ROOM ? "reconnecting" : "connecting";
    if (isLeading()) return "leading";
    const t = target();
    if (t === null) return "no-leader";
    if (paused) return "paused";
    if (targetAway(t)) return "leader-away";
    return "live";
  }

  function buildState(): SessionState {
    return {
      status: computeStatus(),
      room,
      participants,
      following: target(),
      chosen,
      self,
      warnings,
      refused,
    };
  }

  /** Rebuild the snapshot (a new object only when something changed, for useSyncExternalStore), sync presence, notify. */
  function update(): void {
    const next = buildState();
    const changed =
      next.status !== state.status ||
      next.room !== state.room ||
      next.participants !== state.participants ||
      next.following !== state.following ||
      next.chosen !== state.chosen ||
      next.warnings !== state.warnings ||
      next.refused !== state.refused;
    if (changed) state = next;
    syncWriter();
    syncPresence();
    if (changed) for (const cb of [...listeners]) cb();
  }

  // ── Sending ────────────────────────────────────────────────────────────────────────────────────────────────

  function send(env: AnyEnvelope): void {
    // A transport that is not open may throw or silently drop; either way the message is stale by reopen, when we re-join and resync.
    if (ended && env.body.type !== "leave") return;
    if (transport.status !== "open") return;
    try {
      transport.send(env);
    } catch {
      /* the reconnect path recovers */
    }
  }
  const sendControl = (body: ControlMessage) => send({ ch: "control", body });
  const sendState = (body: StateChannelMessage) => send({ ch: "state", body });
  const sendPresence = (body: PresenceMessage) => send({ ch: "presence", body });

  /** Presence says whom I am actually watching: null when leading, paused, or nobody. Sent only when it changes. */
  function syncPresence(): void {
    if (ended || transport.status !== "open" || !roomKnown) return;
    const following = state.status === "live" || state.status === "leader-away" ? target() : null;
    const key = JSON.stringify([following, away]);
    if (key === lastPresence) return;
    lastPresence = key;
    sendPresence({ type: "status", following, away });
  }

  // ── Own stream ─────────────────────────────────────────────────────────────────────────────────────────────

  /** Does anyone need this reader's stream? The spotlight holder always publishes (late joiners land on its keyframe); others when followed. */
  function shouldPublish(): boolean {
    if (ended) return false;
    if (room.spotlight === self.id) return true;
    return participants.some((p) => p.id !== self.id && p.following === self.id);
  }

  /** Start the writer when someone needs the stream (starting sends a keyframe), stop it when nobody does. */
  function syncWriter(): void {
    if (shouldPublish()) startWriter();
    else if (writer) {
      writer.stop();
      writer = null;
    }
  }

  function startWriter(): void {
    if (writer) return;
    writer = streams.createStreamWriter(outgoing, {
      filter: { scope: "moment" },
      sampleMs: { "sefaria.scroll": FOLLOW_SCROLL_SAMPLE_MS },
      ...(opts.now ? { now: opts.now } : {}),
    });
    writer.start((msg: StreamMessage) => sendState(msg));
  }

  function join(): void {
    sendControl({ type: "join", participant: self });
    const slices = Object.entries(api.getSnapshot().slices).map(([id, s]) => ({ id, v: s.v }));
    sendState({ type: "hello", protocol: PROTOCOL_VERSION, slices, client: clientName });
    // A writer that survived a reconnect refreshes the room's copy; otherwise update() starts one once the room says it is needed.
    writer?.keyframe();
  }

  // ── Following ──────────────────────────────────────────────────────────────────────────────────────────────

  function dropReader(): void {
    offGap?.();
    offGap = null;
    reader = null;
    readerOf = null;
  }

  /** Point a fresh reader at `t` (or none) and ask the room for its keyframe; the keyframe applies on arrival unless paused. */
  function retarget(): void {
    const t = isLeading() ? null : target();
    if (t === readerOf && reader) return;
    dropReader();
    if (t === null) return;
    reader = streams.createStreamReader(api, FOLLOW_APPLY);
    readerOf = t;
    if (paused) reader.pause();
    offGap = reader.onGap(() => {
      if (readerOf) sendState({ type: "resync", of: readerOf });
    });
    sendState({ type: "resync", of: t });
  }

  function track(p: Promise<{ warnings: RestoreWarning[] } | undefined>): void {
    p.then(
      (res) => {
        if (!res || ended) return;
        warnings = res.warnings;
        update();
      },
      () => {
        /* applySnapshot never throws by contract; a broken reader must not take the session down */
      },
    );
  }

  function onStateMessage(env: Envelope<"state">): void {
    const body = env.body;
    if (body.type === "hello") return;
    if (body.type === "resync") {
      // The room answers resyncs from what it holds; one relayed to us means it has nothing fresh of ours.
      if (body.of === self.id) writer?.keyframe();
      return;
    }
    if (!reader || !env.from || env.from !== readerOf) return;
    // A lagging message from an earlier spotlight term must not pull followers back to the previous leader.
    if (chosen === null && env.term !== undefined && env.term < room.term) return;
    track(reader.push(body));
  }

  function onControl(body: ControlMessage): void {
    if (body.type === "room") {
      const prevSpotlight = room.spotlight;
      room = { spotlight: body.spotlight, term: body.term, mode: body.mode, hands: body.hands, ended: body.ended };
      roomKnown = true;
      if (body.ended) {
        finish(false);
        return;
      }
      // Just took the spotlight: refresh the room's copy of our state, so followers land where we are, not on an old keyframe.
      if (body.spotlight === self.id && prevSpotlight !== self.id) writer?.keyframe();
      retarget();
      update();
    } else if (body.type === "refused") {
      refused = { of: body.of, reason: body.reason };
      update();
    }
  }

  function onPresence(body: PresenceMessage): void {
    if (body.type !== "participants") return;
    participants = body.participants;
    participantsKnown = true;
    update();
  }

  function onMessage(raw: AnyEnvelope): void {
    if (ended) return;
    const env = parseRoomEnvelope(raw);
    if (!env) return;
    if (env.ch === "state") onStateMessage(env);
    else if (env.ch === "control") onControl(env.body);
    else if (env.ch === "presence") onPresence(env.body);
  }

  function onStatus(status: TransportStatus): void {
    if (ended) return;
    if (status === "open") {
      const reopening = wasOpen;
      wasOpen = true;
      roomKnown = false;
      lastPresence = null;
      join();
      // On reopen, the reader may have missed messages: ask for a fresh keyframe of whoever we follow.
      if (reopening && readerOf) sendState({ type: "resync", of: readerOf });
    } else {
      roomKnown = false;
    }
    update();
  }

  // ── Breaking away ──────────────────────────────────────────────────────────────────────────────────────────

  function breakAway(): void {
    if (ended || paused || !reader || state.status === "leading") return;
    paused = true;
    reader.pause();
    update();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────────────────────────────────────

  function onVisibility(): void {
    away = document.visibilityState === "hidden";
    update();
  }

  const offs: (() => void)[] = [];
  offs.push(transport.onMessage(onMessage));
  offs.push(transport.onStatus(onStatus));
  // Breaking away is decided by the person's input alone. A local change with no input is the reader settling itself — the text panel
  // reporting its first position after a join, a column restoring its anchor — and must not pause a follower (it did, 1 join in 15).
  offs.push(api.onLocalInput(breakAway));
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
    offs.push(() => document.removeEventListener("visibilitychange", onVisibility));
  }

  /** Tear down. `leave`: we chose to go (tell the room); otherwise the room ended. */
  function finish(leave: boolean): void {
    if (ended) return;
    if (leave) sendControl({ type: "leave" });
    ended = true;
    writer?.stop();
    writer = null;
    dropReader();
    for (const off of offs.splice(0)) off();
    try {
      transport.close();
    } catch {
      /* already closed */
    }
    state = buildState();
    for (const cb of [...listeners]) cb();
  }

  if (transport.status === "open") onStatus("open");

  return {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    follow(participantId) {
      if (ended) return;
      chosen = participantId === self.id ? null : participantId;
      paused = false;
      const before = readerOf;
      retarget();
      // Same stream as before (e.g. picking the spotlight holder explicitly): just resume it.
      if (reader && readerOf === before && reader.paused) track(reader.resume());
      update();
    },
    followAgain() {
      if (ended || !paused) return;
      paused = false;
      if (reader) track(reader.resume());
      update();
    },
    spotlight: (to) => sendControl({ type: "spotlight", to }),
    raiseHand: () => sendControl({ type: "raise-hand" }),
    setMode: (mode) => sendControl({ type: "mode", mode }),
    end: () => sendControl({ type: "end" }),
    stop: () => finish(true),
  };
}
