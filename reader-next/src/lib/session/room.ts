/**
 * The room (docs/READER_STATE_API.md, "Sessions"): the single source of order for one follow session. It relays participants' reader
 * streams, keeps each one's latest state (so a joining follower does not need the leader's tab to be awake), holds the spotlight and its
 * term, and enforces the limits.
 *
 * Each participant gets only what they subscribe to: the spotlight holder's stream goes to everyone (followers, and those who broke away
 * and may "Follow again"); anyone else's only to the members whose presence says they follow them. Every channel is rate-limited per
 * connection, keyframes included, so one link-holder cannot flood the room or make it broadcast the participants list without end.
 *
 * Pure and deterministic: no timers, no I/O, an injected clock. A host feeds it connections and raw messages and delivers what it
 * returns — `local-room.ts` over BroadcastChannel in a tab, `scripts/dev-room-server.mjs` over WebSockets, and later the Durable Object
 * relay. Grace periods advance only when the host calls `tick()`.
 *
 * Relative imports only (type-only imports excepted), so Node (via esbuild) can load this file without the app's "~/" alias.
 */
import type { ReaderSnapshot, SnapshotChange, StreamMessage } from "../reader-state/core/types";
import { fold } from "../reader-state/core/diff";
import type {
  AnyEnvelope,
  ControlMessage,
  Envelope,
  LeadershipMode,
  Participant,
  ParticipantId,
  PresenceMessage,
  StateChannelMessage,
} from "./protocol";
import { LIMITS } from "./protocol";

export type ConnId = string;

export interface Outgoing {
  /** One connection, every joined connection, or every joined connection but one. */
  to: ConnId | "all" | { except: ConnId };
  envelope: AnyEnvelope;
}

export interface RoomLimits {
  maxMessageBytes: number;
  maxParticipants: number;
  stateMessagesPerSecond: number;
  /** Keyframes have their own allowance (default {@link KEYFRAMES_PER_SECOND}): enough to answer resyncs, too few to flood with. */
  keyframesPerSecond?: number;
  /** Control and presence together (default {@link CONTROL_MESSAGES_PER_SECOND}); `leave` always passes. */
  controlMessagesPerSecond?: number;
}

/** A writer sends one on start, on taking the spotlight, on a resync and every 10 s or 50 changes: a few a second is plenty. */
export const KEYFRAMES_PER_SECOND = 4;
/** Each presence or control message can make the room broadcast to everyone; a person clicks far less often than this. */
export const CONTROL_MESSAGES_PER_SECOND = 5;

export interface RoomOptions {
  now: () => number;
  /** How long the spotlight waits for a holder who left before it moves to a connected host (or clears). */
  graceMs?: number;
  limits?: RoomLimits;
}

export interface RoomSnapshot {
  spotlight: ParticipantId | null;
  term: number;
  mode: LeadershipMode;
  hands: ParticipantId[];
  ended: boolean;
  /** When the spotlight moves if its holder has not come back (ms, the room's clock); null when no holder is away. */
  graceUntil: number | null;
  participants: (Participant & { following: ParticipantId | null; away: boolean; conn: ConnId })[];
  streams: Record<ParticipantId, { seq: number; t: number; snapshot: ReaderSnapshot | null }>;
}

export interface Room {
  connect(connId: ConnId): void;
  /** The connection is gone: as a leave, if it had joined. */
  disconnect(connId: ConnId): Outgoing[];
  /** A raw message from a connection: an envelope object or its JSON text. Invalid input is dropped. */
  handle(connId: ConnId, raw: unknown): Outgoing[];
  /** Advance timers (the spotlight's grace) to now(). The host calls this about once a second. */
  tick(): Outgoing[];
  /** The joined connections an Outgoing's `to` addresses, for hosts that deliver one connection at a time. */
  recipients(to: Outgoing["to"]): ConnId[];
  /** A copy of the room's state, for tests and debugging. */
  snapshot(): RoomSnapshot;
}

interface Member {
  participant: Participant;
  conn: ConnId;
  following: ParticipantId | null;
  away: boolean;
}

interface Stream {
  /** The last keyframe with every later change folded in; null until the first keyframe. */
  snapshot: ReaderSnapshot | null;
  seq: number;
  t: number;
}

interface Conn {
  participant: ParticipantId | null;
  /** Rate limits: a fixed one-second window, with separate counts for changes, keyframes and control/presence. */
  windowStart: number;
  count: number;
  keyframes: number;
  control: number;
}

const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MODES: readonly LeadershipMode[] = ["presenter", "hand-raise", "open"];

export function createRoom({ now, graceMs = 30_000, limits = LIMITS }: RoomOptions): Room {
  const conns = new Map<ConnId, Conn>();
  // Insertion order is join order: the participants list and "a connected host" both use it.
  const members = new Map<ParticipantId, Member>();
  const streams = new Map<ParticipantId, Stream>();
  let spotlight: ParticipantId | null = null;
  let term = 0;
  let mode: LeadershipMode = "presenter";
  let hands: ParticipantId[] = [];
  let ended = false;
  let graceUntil: number | null = null;
  let controlSeq = 0;

  // ── Outgoing envelopes ──────────────────────────────────────────────────────────────────────────────────────

  function control(to: Outgoing["to"], body: ControlMessage): Outgoing {
    const envelope: Envelope<"control"> = { ch: "control", seq: ++controlSeq, t: now(), body };
    return { to, envelope };
  }

  function roomState(to: Outgoing["to"]): Outgoing {
    return control(to, { type: "room", spotlight, term, mode, hands: [...hands], ended });
  }

  function refused(to: ConnId, of: string, reason: string): Outgoing {
    return control(to, { type: "refused", of, reason });
  }

  function participantsMessage(to: Outgoing["to"] = "all"): Outgoing {
    const body: PresenceMessage = {
      type: "participants",
      participants: [...members.values()].map((m) => ({ ...m.participant, following: m.following, away: m.away })),
    };
    const envelope: Envelope<"presence"> = { ch: "presence", t: now(), body };
    return { to, envelope };
  }

  // ── Spotlight ───────────────────────────────────────────────────────────────────────────────────────────────

  /** Every change bumps the term, so followers can drop a lagging message from the previous holder. */
  function setSpotlight(to: ParticipantId | null): void {
    const previous = spotlight;
    spotlight = to;
    term += 1;
    graceUntil = null;
    if (to !== null) hands = hands.filter((h) => h !== to);
    // A holder who left was kept only so followers could resync to where they were; once the spotlight moves on, forget them.
    if (previous !== null && previous !== to && !members.has(previous)) streams.delete(previous);
  }

  function firstConnectedHost(): ParticipantId | null {
    for (const m of members.values()) if (m.participant.isHost) return m.participant.id;
    return null;
  }

  // ── Joining and leaving ─────────────────────────────────────────────────────────────────────────────────────

  /** Remove a participant. Returns whether the room state (spotlight, hands) changed and needs broadcasting. */
  function removeMember(id: ParticipantId): boolean {
    const member = members.get(id);
    if (!member) return false;
    members.delete(id);
    const conn = conns.get(member.conn);
    if (conn && conn.participant === id) conn.participant = null;
    let roomChanged = false;
    if (hands.includes(id)) {
      hands = hands.filter((h) => h !== id);
      roomChanged = true;
    }
    if (spotlight === id) {
      // Keep the spotlight (and the stream) for a while: a reload or a dropped connection comes back under the same id.
      graceUntil = now() + graceMs;
    } else {
      streams.delete(id);
    }
    return roomChanged;
  }

  function leave(connId: ConnId): Outgoing[] {
    const conn = conns.get(connId);
    if (!conn || conn.participant === null) return [];
    const roomChanged = removeMember(conn.participant);
    const out = [participantsMessage()];
    if (roomChanged) out.push(roomState("all"));
    return out;
  }

  function join(connId: ConnId, conn: Conn, participant: Participant): Outgoing[] {
    if (ended) return [roomState(connId)];
    const out: Outgoing[] = [];
    let roomChanged = false;
    // A second join on one connection replaces the first.
    if (conn.participant !== null && conn.participant !== participant.id) {
      roomChanged = removeMember(conn.participant) || roomChanged;
    }
    const existing = members.get(participant.id);
    if (
      existing &&
      existing.conn === connId &&
      conn.participant === participant.id &&
      existing.participant.name === participant.name &&
      existing.participant.isHost === participant.isHost &&
      existing.participant.canLead === participant.canLead
    ) {
      // The same join again (a client re-sending it): answer the joiner, broadcast nothing.
      return [roomState(connId), participantsMessage(connId)];
    }
    if (!existing && members.size >= limits.maxParticipants) {
      return [...(roomChanged ? [participantsMessage(), roomState("all")] : []), refused(connId, "join", "room full")];
    }
    if (existing && existing.conn !== connId) {
      // The same participant from a new connection (a reconnect the old socket has not noticed yet): the new one wins.
      const old = conns.get(existing.conn);
      if (old) old.participant = null;
    }
    members.set(participant.id, {
      participant,
      conn: connId,
      following: existing?.following ?? null,
      away: existing?.away ?? false,
    });
    conn.participant = participant.id;
    // The holder came back within the grace period: nothing moves.
    if (spotlight === participant.id && graceUntil !== null) graceUntil = null;
    if (spotlight === null && participant.isHost) {
      setSpotlight(participant.id);
      roomChanged = true;
    }
    // The joiner always gets the room's state addressed to it (its transport knows it is in); everyone else only if it changed.
    out.push(roomState(connId));
    if (roomChanged) out.push(roomState({ except: connId }));
    out.push(participantsMessage());
    return out;
  }

  // ── Control ─────────────────────────────────────────────────────────────────────────────────────────────────

  function handleControl(connId: ConnId, conn: Conn, body: ControlMessage): Outgoing[] {
    if (body.type === "join") return join(connId, conn, body.participant);
    if (ended) return [refused(connId, body.type, "ended")];
    if (conn.participant === null) return [refused(connId, body.type, "not joined")];
    const self = members.get(conn.participant)!.participant;

    switch (body.type) {
      case "leave":
        return leave(connId);
      case "spotlight": {
        const allowed =
          self.isHost || spotlight === self.id || (mode === "open" && self.canLead && body.to === self.id);
        if (!allowed) return [refused(connId, "spotlight", "not permitted")];
        if (body.to !== null) {
          const target = members.get(body.to);
          if (!target) return [refused(connId, "spotlight", "unknown participant")];
          if (!target.participant.canLead && !target.participant.isHost) {
            return [refused(connId, "spotlight", "participant cannot lead")];
          }
        }
        if (body.to === spotlight && graceUntil === null) return [roomState(connId)];
        setSpotlight(body.to);
        return [roomState("all")];
      }
      case "raise-hand": {
        if (!self.canLead && !self.isHost) return [refused(connId, "raise-hand", "cannot lead")];
        if (spotlight === self.id || hands.includes(self.id)) return [roomState(connId)];
        hands = [...hands, self.id];
        return [roomState("all")];
      }
      case "mode": {
        if (!self.isHost) return [refused(connId, "mode", "host only")];
        mode = body.mode;
        if (mode !== "hand-raise") hands = [];
        return [roomState("all")];
      }
      case "end": {
        if (!self.isHost) return [refused(connId, "end", "host only")];
        ended = true;
        graceUntil = null;
        return [roomState("all")];
      }
      default:
        // "room" and "refused" never get here: parseControl drops them.
        return [];
    }
  }

  // ── State ───────────────────────────────────────────────────────────────────────────────────────────────────

  /** Fixed one-second window per connection, one count per kind of message. True: over the limit, drop it. */
  function overRate(conn: Conn, kind: "state" | "keyframe" | "control"): boolean {
    const t = now();
    if (t - conn.windowStart >= 1000 || t < conn.windowStart) {
      conn.windowStart = t;
      conn.count = 0;
      conn.keyframes = 0;
      conn.control = 0;
    }
    if (kind === "keyframe") return ++conn.keyframes > (limits.keyframesPerSecond ?? KEYFRAMES_PER_SECOND);
    if (kind === "control") return ++conn.control > (limits.controlMessagesPerSecond ?? CONTROL_MESSAGES_PER_SECOND);
    return ++conn.count > limits.stateMessagesPerSecond;
  }

  function handleState(connId: ConnId, conn: Conn, body: StateChannelMessage): Outgoing[] {
    if (ended || conn.participant === null) return [];
    const from = conn.participant;
    const limited = overRate(conn, body.type === "keyframe" ? "keyframe" : "state");

    if (body.type === "hello") {
      // Answer with the spotlight's current state, so a joining follower paints at once (it may also resync; a second keyframe is harmless).
      if (limited || spotlight === null || spotlight === from) return [];
      const kf = keyframeOf(spotlight, connId);
      return kf ? [kf] : [];
    }
    if (body.type === "resync") {
      if (limited) return [];
      const kf = keyframeOf(body.of, connId);
      return kf ? [kf] : [];
    }

    // The running snapshot folds every message, relayed or not: a change dropped by the rate limit leaves followers with a seq gap,
    // they resync, and the room's answer must include it.
    const stream = streams.get(from) ?? { snapshot: null, seq: 0, t: 0 };
    if (body.type === "keyframe") {
      stream.snapshot = body.snapshot;
    } else if (stream.snapshot) {
      stream.snapshot = fold(stream.snapshot, body.change);
    }
    stream.seq = body.seq;
    stream.t = body.t;
    streams.set(from, stream);

    if (limited) return [];
    const envelope: Envelope<"state"> = { ch: "state", from, t: now(), body };
    if (from === spotlight) {
      envelope.term = term;
      return [{ to: { except: connId }, envelope }];
    }
    // Not the spotlight: only to those following this participant (a guest who wandered off is not broadcasting where they went).
    const out: Outgoing[] = [];
    for (const m of members.values()) {
      if (m.following === from && m.conn !== connId) out.push({ to: m.conn, envelope });
    }
    return out;
  }

  /** A keyframe of a participant's stream from what the room holds, addressed to one connection. */
  function keyframeOf(of: ParticipantId, to: ConnId): Outgoing | null {
    const stream = streams.get(of);
    if (!stream || !stream.snapshot) return null;
    const body: StreamMessage = { type: "keyframe", seq: stream.seq, t: stream.t, snapshot: stream.snapshot };
    const envelope: Envelope<"state"> = { ch: "state", from: of, t: now(), body };
    if (of === spotlight) envelope.term = term;
    return { to, envelope };
  }

  // ── Presence ────────────────────────────────────────────────────────────────────────────────────────────────

  function handlePresence(conn: Conn, body: PresenceMessage): Outgoing[] {
    if (ended || conn.participant === null || body.type !== "status") return [];
    const member = members.get(conn.participant)!;
    // Nothing changed: nothing to tell 200 people.
    if (member.following === body.following && member.away === body.away) return [];
    member.following = body.following;
    member.away = body.away;
    return [participantsMessage()];
  }

  // ── The room ────────────────────────────────────────────────────────────────────────────────────────────────

  return {
    connect(connId) {
      if (!conns.has(connId)) conns.set(connId, { participant: null, windowStart: now(), count: 0, keyframes: 0, control: 0 });
    },

    disconnect(connId) {
      const out = leave(connId);
      conns.delete(connId);
      return out;
    },

    handle(connId, raw) {
      const conn = conns.get(connId);
      if (!conn) return [];
      const envelope = parseEnvelope(raw, limits.maxMessageBytes);
      if (!envelope) return [];
      // Whatever the client put in from/seq/t/term is ignored: parseEnvelope keeps only ch and body.
      if (envelope.ch !== "state" && !(envelope.ch === "control" && envelope.body.type === "leave") && overRate(conn, "control")) return [];
      switch (envelope.ch) {
        case "control":
          return handleControl(connId, conn, envelope.body);
        case "state":
          return handleState(connId, conn, envelope.body);
        case "presence":
          return handlePresence(conn, envelope.body);
      }
    },

    tick() {
      if (ended || graceUntil === null || now() < graceUntil) return [];
      setSpotlight(firstConnectedHost());
      return [roomState("all")];
    },

    recipients(to) {
      const joined = [...conns.entries()].filter(([, c]) => c.participant !== null).map(([id]) => id);
      if (to === "all") return joined;
      if (typeof to === "string") return conns.has(to) ? [to] : [];
      return joined.filter((id) => id !== to.except);
    },

    snapshot() {
      return {
        spotlight,
        term,
        mode,
        hands: [...hands],
        ended,
        graceUntil,
        participants: [...members.values()].map((m) => ({
          ...m.participant,
          following: m.following,
          away: m.away,
          conn: m.conn,
        })),
        streams: Object.fromEntries([...streams.entries()].map(([id, s]) => [id, { ...s }])),
      };
    },
  };
}

// ── Validation ────────────────────────────────────────────────────────────────────────────────────────────────
// Everything from a connection is untrusted. Each check returns a fresh object holding only the fields the protocol defines, so nothing
// a client adds (or a __proto__ key) is relayed, and the client's from/seq/t/term never survive.

type Inbound =
  | { ch: "control"; body: ControlMessage }
  | { ch: "state"; body: StateChannelMessage }
  | { ch: "presence"; body: PresenceMessage };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isId = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= MAX_ID_LENGTH;
const isSeq = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

export function parseEnvelope(raw: unknown, maxBytes: number = LIMITS.maxMessageBytes): Inbound | null {
  let text: string | undefined;
  let value: unknown = raw;
  try {
    if (typeof raw === "string") {
      text = raw;
      if (text.length > maxBytes) return null;
      value = JSON.parse(raw);
    } else {
      text = JSON.stringify(raw);
    }
  } catch {
    return null;
  }
  if (text === undefined || text.length > maxBytes) return null;
  if (!isObj(value) || !isObj(value.body)) return null;
  const body = value.body;
  switch (value.ch) {
    case "control": {
      const c = parseControl(body);
      return c ? { ch: "control", body: c } : null;
    }
    case "state": {
      const s = parseState(body);
      return s ? { ch: "state", body: s } : null;
    }
    case "presence": {
      const p = parsePresence(body);
      return p ? { ch: "presence", body: p } : null;
    }
    default:
      // "chat" is reserved and not built; anything else is not ours.
      return null;
  }
}

function parseParticipant(x: unknown): Participant | null {
  if (!isObj(x) || !isId(x.id) || typeof x.isHost !== "boolean" || typeof x.canLead !== "boolean") return null;
  const p: Participant = { id: x.id, isHost: x.isHost, canLead: x.canLead };
  if (x.name !== undefined) {
    if (typeof x.name !== "string") return null;
    p.name = x.name.slice(0, MAX_NAME_LENGTH);
  }
  return p;
}

function parseControl(b: Obj): ControlMessage | null {
  switch (b.type) {
    case "join": {
      const participant = parseParticipant(b.participant);
      return participant ? { type: "join", participant } : null;
    }
    case "leave":
    case "raise-hand":
    case "end":
      return { type: b.type };
    case "spotlight":
      return b.to === null || isId(b.to) ? { type: "spotlight", to: b.to } : null;
    case "mode":
      return MODES.includes(b.mode as LeadershipMode) ? { type: "mode", mode: b.mode as LeadershipMode } : null;
    default:
      // Including "room" and "refused": those are the room's own messages, never a client's.
      return null;
  }
}

function parsePresence(b: Obj): PresenceMessage | null {
  if (b.type !== "status") return null;
  if (!(b.following === null || isId(b.following)) || typeof b.away !== "boolean") return null;
  return { type: "status", following: b.following, away: b.away };
}

function parseState(b: Obj): StateChannelMessage | null {
  switch (b.type) {
    case "hello": {
      if (b.protocol !== 1 || typeof b.client !== "string" || !Array.isArray(b.slices)) return null;
      const slices: { id: string; v: number }[] = [];
      for (const s of b.slices) {
        if (!isObj(s) || typeof s.id !== "string" || typeof s.v !== "number") return null;
        slices.push({ id: s.id, v: s.v });
      }
      return { type: "hello", protocol: 1, slices, client: b.client.slice(0, MAX_NAME_LENGTH) };
    }
    case "resync":
      return isId(b.of) ? { type: "resync", of: b.of } : null;
    case "keyframe": {
      if (!isSeq(b.seq) || !isTime(b.t)) return null;
      const snapshot = parseSnapshot(b.snapshot);
      return snapshot ? { type: "keyframe", seq: b.seq, t: b.t, snapshot } : null;
    }
    case "change": {
      if (!isSeq(b.seq) || !isTime(b.t)) return null;
      const change = parseChange(b.change);
      return change ? { type: "change", seq: b.seq, t: b.t, change } : null;
    }
    default:
      return null;
  }
}

function parseSliceValue(x: unknown): { v: number; value: unknown } | null {
  if (!isObj(x) || typeof x.v !== "number" || !Number.isFinite(x.v)) return null;
  return { v: x.v, value: x.value };
}

/** The room does not interpret reader state; it checks the shape it needs to fold and relay. */
function parseSnapshot(x: unknown): ReaderSnapshot | null {
  if (!isObj(x) || x.v !== 1 || typeof x.url !== "string" || !isObj(x.slices)) return null;
  const slices: ReaderSnapshot["slices"] = {};
  for (const [id, value] of Object.entries(x.slices)) {
    if (FORBIDDEN.has(id)) continue;
    const sv = parseSliceValue(value);
    if (!sv) return null;
    slices[id] = sv;
  }
  return { v: 1, url: x.url, nav: x.nav, slices };
}

function parseChange(x: unknown): SnapshotChange | null {
  if (!isObj(x)) return null;
  const change: SnapshotChange = {};
  if (x.url !== undefined) {
    if (typeof x.url !== "string") return null;
    change.url = x.url;
  }
  if (Object.prototype.hasOwnProperty.call(x, "nav")) change.nav = x.nav;
  if (x.slices !== undefined) {
    if (!isObj(x.slices)) return null;
    const slices: NonNullable<SnapshotChange["slices"]> = {};
    for (const [id, value] of Object.entries(x.slices)) {
      if (FORBIDDEN.has(id)) continue;
      if (value === null) {
        slices[id] = null;
        continue;
      }
      const sv = parseSliceValue(value);
      if (!sv) return null;
      slices[id] = sv;
    }
    change.slices = slices;
  }
  return change;
}
