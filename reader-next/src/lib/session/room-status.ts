/**
 * The follow session's status read (Sefaria Social spec 032): what a feed card shows about a live follow-me session without
 * opening a socket — where the spotlight is now, who holds it, and how many are in the room. The relay serves it to the social
 * server at `GET /status/<sessionId>` behind a shared secret; nothing personal or reader-internal leaves the room, only the
 * spotlight stream's address (already moment-scoped and stripped of anything entry-specific by its publisher) and a name.
 */
import type { RoomSnapshot } from "./room";

export const STATUS_PATH = /^\/status\/([A-Za-z0-9_-]{8,128})$/;

export interface RoomStatus {
  /** Someone holds the spotlight and is connected (a hidden tab still counts: see `away`). */
  live: boolean;
  /** The leader's tab is hidden for now (they looked at another tab); the session goes on. */
  away: boolean;
  /** The spotlight stream's address ("/Genesis.1?lang=bi"); null when no one leads or it is not a same-site path. */
  url: string | null;
  /** The leader's display name, when they gave one. */
  leader: string | null;
  participants: number;
}

const MAX_URL = 2000;
const MAX_NAME = 80;

export function statusOf(snap: RoomSnapshot): RoomStatus {
  const participants = snap.participants.length;
  const lead = snap.spotlight ? snap.participants.find((p) => p.id === snap.spotlight) : undefined;
  const rawUrl = snap.spotlight ? snap.streams[snap.spotlight]?.snapshot?.url : undefined;
  const url = typeof rawUrl === "string" && rawUrl.startsWith("/") && !rawUrl.startsWith("//") && rawUrl.length <= MAX_URL ? rawUrl : null;
  const name = typeof lead?.name === "string" ? lead.name.trim().slice(0, MAX_NAME) : "";
  return { live: Boolean(lead), away: Boolean(lead?.away), url, leader: name || null, participants };
}

const enc = new TextEncoder();

/** Is the request's `Authorization` the configured secret? Constant time; an unset secret refuses everything. */
export function statusAuthorized(header: string | null, secret: string | undefined, equal: (a: Uint8Array, b: Uint8Array) => boolean): boolean {
  if (!secret) return false;
  const given = enc.encode(header ?? "");
  const expected = enc.encode(`Bearer ${secret}`);
  return given.byteLength === expected.byteLength && equal(given, expected);
}
