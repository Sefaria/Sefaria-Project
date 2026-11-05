/**
 * The room protocol (docs/READER_STATE_API.md, "Sessions"): one connection, several channels. The reader-state core knows only the body of
 * the `state` channel; the envelope, `control` and `presence` belong to this session layer. (`chat` is reserved; not built yet.)
 */
import type { StreamMessage, SliceId } from "~/lib/reader-state/core/types";

export type ParticipantId = string;
export type Channel = "state" | "control" | "presence" | "chat";

export interface Participant {
  id: ParticipantId;
  name?: string;
  isHost: boolean;
  canLead: boolean;
}

export type StateChannelMessage =
  | { type: "hello"; protocol: 1; slices: { id: SliceId; v: number }[]; client: string }
  /** Send me a keyframe of this participant's stream (join, gap, reconnect). The room answers from what it holds. */
  | { type: "resync"; of: ParticipantId }
  | StreamMessage;

export type LeadershipMode = "presenter" | "hand-raise" | "open";

export type ControlMessage =
  /** Client → room: join with who I am (local mode; with a backend this comes from the token). */
  | { type: "join"; participant: Participant }
  | { type: "leave" }
  /** Move the spotlight (null clears it). The room checks permission. */
  | { type: "spotlight"; to: ParticipantId | null }
  | { type: "raise-hand" }
  | { type: "mode"; mode: LeadershipMode }
  | { type: "end" }
  /** Room → clients: the room's state after any control change, and on join. */
  | { type: "room"; spotlight: ParticipantId | null; term: number; mode: LeadershipMode; hands: ParticipantId[]; ended: boolean }
  /** Room → client: a control message was refused. */
  | { type: "refused"; of: string; reason: string };

export type PresenceMessage =
  /** Room → clients: who is here. */
  | { type: "participants"; participants: (Participant & { following: ParticipantId | null; away: boolean })[] }
  /** Client → room: whom I follow (null: nobody / wandered off) and whether my tab is hidden. */
  | { type: "status"; following: ParticipantId | null; away: boolean };

export interface ChannelBody {
  state: StateChannelMessage;
  control: ControlMessage;
  presence: PresenceMessage;
  chat: never;
}

export interface Envelope<C extends Channel = Channel> {
  ch: C;
  /** Stamped by the room; a client's value is ignored. */
  from?: ParticipantId;
  /** Stamped by the room on control messages it sends. */
  seq?: number;
  /** Server time (ms), stamped by the room. */
  t?: number;
  /** The spotlight term when the room relayed this (state messages of the spotlight holder). */
  term?: number;
  body: ChannelBody[C];
}

export type AnyEnvelope = { [C in Channel]: Envelope<C> }[Channel];

export const PROTOCOL_VERSION = 1;
/** Limits the room enforces. */
export const LIMITS = { maxMessageBytes: 16_384, maxParticipants: 200, stateMessagesPerSecond: 20 } as const;
