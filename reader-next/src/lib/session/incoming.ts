/**
 * What arrives from the room, checked before the client acts on it (docs/READER_STATE_API.md, "Security of what arrives": envelopes are
 * parsed, never cast). The room is not the only thing that can write to a transport — in local mode any same-origin script can post on the
 * BroadcastChannel, and a relay may misbehave — so a `participants: null` or a string `term` must be dropped here, not crash the client's
 * status machine or the follow bar's render.
 *
 * Each check returns a fresh object holding only the fields the protocol defines, with names and ids clamped the way the room clamps
 * them (./room.ts). State bodies are checked with the core's stream schema (keyframes and changes) — the stream reader checks them again,
 * which is cheap and keeps it safe on its own.
 */
import { parseStreamMessage } from "~/lib/reader-state/core/schema";
import {
  LIMITS,
  type AnyEnvelope,
  type ControlMessage,
  type Envelope,
  type LeadershipMode,
  type ParticipantId,
  type PresenceMessage,
  type StateChannelMessage,
} from "./protocol";
import type { PresentParticipant } from "./client";

const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_REASON_LENGTH = 200;
const MODES: readonly LeadershipMode[] = ["presenter", "hand-raise", "open"];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isId = (x: unknown): x is ParticipantId => typeof x === "string" && x.length > 0 && x.length <= MAX_ID_LENGTH;
const isCount = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0;
const clamp = (x: string, n: number) => (x.length > n ? x.slice(0, n) : x);

/** A room-to-client envelope, or null when it is not one this client can act on. */
export function parseRoomEnvelope(raw: unknown): AnyEnvelope | null {
  if (!isObj(raw) || !isObj(raw.body)) return null;
  switch (raw.ch) {
    case "control": {
      const body = parseControl(raw.body);
      return body ? { ch: "control", body } : null;
    }
    case "presence": {
      const body = parsePresence(raw.body);
      return body ? { ch: "presence", body } : null;
    }
    case "state": {
      const body = parseState(raw.body);
      if (!body) return null;
      const env: Envelope<"state"> = { ch: "state", body };
      if (raw.from !== undefined) {
        if (!isId(raw.from)) return null;
        env.from = raw.from;
      }
      if (raw.term !== undefined) {
        if (!isCount(raw.term)) return null;
        env.term = raw.term;
      }
      return env;
    }
    default:
      return null;
  }
}

function parseControl(b: Obj): ControlMessage | null {
  if (b.type === "room") {
    if (!(b.spotlight === null || isId(b.spotlight)) || !isCount(b.term) || typeof b.ended !== "boolean") return null;
    if (!MODES.includes(b.mode as LeadershipMode) || !Array.isArray(b.hands)) return null;
    const hands = b.hands.filter(isId).slice(0, LIMITS.maxParticipants);
    return { type: "room", spotlight: b.spotlight, term: b.term, mode: b.mode as LeadershipMode, hands, ended: b.ended };
  }
  if (b.type === "refused") {
    if (typeof b.of !== "string" || typeof b.reason !== "string") return null;
    return { type: "refused", of: clamp(b.of, MAX_ID_LENGTH), reason: clamp(b.reason, MAX_REASON_LENGTH) };
  }
  // The client's own messages (join, spotlight, …) never come from the room.
  return null;
}

function parsePresentParticipant(x: unknown): PresentParticipant | null {
  if (!isObj(x) || !isId(x.id) || typeof x.isHost !== "boolean" || typeof x.canLead !== "boolean") return null;
  if (!(x.following === null || isId(x.following)) || typeof x.away !== "boolean") return null;
  const p: PresentParticipant = { id: x.id, isHost: x.isHost, canLead: x.canLead, following: x.following, away: x.away };
  if (typeof x.name === "string") p.name = clamp(x.name, MAX_NAME_LENGTH);
  return p;
}

function parsePresence(b: Obj): PresenceMessage | null {
  if (b.type !== "participants" || !Array.isArray(b.participants)) return null;
  const seen = new Set<ParticipantId>();
  const participants: PresentParticipant[] = [];
  for (const x of b.participants.slice(0, LIMITS.maxParticipants)) {
    const p = parsePresentParticipant(x);
    if (!p || seen.has(p.id)) continue; // one bad entry does not cost the others their faces
    seen.add(p.id);
    participants.push(p);
  }
  return { type: "participants", participants };
}

function parseState(b: Obj): StateChannelMessage | null {
  switch (b.type) {
    case "hello":
      // The client ignores another's hello; keep the shape honest anyway.
      return { type: "hello", protocol: 1, slices: [], client: typeof b.client === "string" ? clamp(b.client, MAX_NAME_LENGTH) : "" };
    case "resync":
      return isId(b.of) ? { type: "resync", of: b.of } : null;
    case "keyframe":
    case "change":
      return parseStreamMessage(b);
    default:
      return null;
  }
}
