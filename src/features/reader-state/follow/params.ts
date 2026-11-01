/**
 * The small pure pieces of follow me (docs/READER_STATE_API.md, "Starting: the leader" and "Joining: the follower"): the `follow`
 * parameter in and out of an address, what sessionStorage keeps so a reload re-hosts or re-joins, and the labels the follow bar shows.
 *
 * Addresses are edited as raw strings, never through URLSearchParams: the old grammar's query (`with=`, `lang=`, Hebrew titles) is kept
 * byte for byte, so stripping `follow` cannot change what the rest of the address means.
 */
import { urlToRef } from "~/lib/ref/url";
import { isSessionId } from "~/lib/session/ids";
import type { ParticipantId } from "~/lib/session/protocol";

export const FOLLOW_PARAM = "follow";
export const FOLLOW_STORAGE_KEY = "sefaria-follow";

const isFollowPair = (pair: string) => pair === FOLLOW_PARAM || pair.startsWith(`${FOLLOW_PARAM}=`);

/** The session id a `follow` parameter carries, if it is shaped like one (anything else is untrusted noise and ignored). */
export function followParamOf(search: string): string | null {
  for (const pair of search.replace(/^\?/, "").split("&")) {
    if (!pair.startsWith(`${FOLLOW_PARAM}=`)) continue;
    const value = pair.slice(FOLLOW_PARAM.length + 1);
    if (isSessionId(value)) return value;
  }
  return null;
}

/** `search` ("?a=1&follow=…&b=2") without any `follow` parameter, the rest untouched: "?a=1&b=2", or "" when nothing is left. */
export function withoutFollowParam(search: string): string {
  const kept = search.replace(/^\?/, "").split("&").filter((pair) => pair !== "" && !isFollowPair(pair));
  return kept.length ? `?${kept.join("&")}` : "";
}

/** The share link: `href` (absolute or relative) with `follow=<id>` appended in place of any earlier one; the hash stays last. */
export function withFollowParam(href: string, sessionId: string): string {
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const queryAt = beforeHash.indexOf("?");
  const base = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const search = withoutFollowParam(queryAt >= 0 ? beforeHash.slice(queryAt) : "");
  return `${base}${search ? `${search}&` : "?"}${FOLLOW_PARAM}=${sessionId}${hash}`;
}

// ── sessionStorage ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What survives a reload: the session id (already in the link, so nothing secret is added), whether this tab hosts it, and the participant
 * id — coming back under the same id lets the room hand a returning leader the spotlight it kept for them during its grace period.
 */
export interface StoredFollow {
  sessionId: string;
  role: "host" | "guest";
  participantId: ParticipantId;
}

/** Storage that may be missing (SSR) or throw (blocked by the browser); every use is guarded. */
export function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function readStoredFollow(storage: Storage | null): StoredFollow | null {
  try {
    const raw = storage?.getItem(FOLLOW_STORAGE_KEY);
    if (!raw) return null;
    const x = JSON.parse(raw) as Partial<StoredFollow> | null;
    if (!x || typeof x !== "object" || !isSessionId(x.sessionId)) return null;
    if (x.role !== "host" && x.role !== "guest") return null;
    if (typeof x.participantId !== "string" || !/^[0-9A-Za-z]{1,64}$/.test(x.participantId)) return null;
    return { sessionId: x.sessionId, role: x.role, participantId: x.participantId };
  } catch {
    return null;
  }
}

export function writeStoredFollow(storage: Storage | null, value: StoredFollow): void {
  try {
    storage?.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* blocked or full: a reload then simply does not rejoin */
  }
}

export function clearStoredFollow(storage: Storage | null): void {
  try {
    storage?.removeItem(FOLLOW_STORAGE_KEY);
  } catch {
    /* blocked */
  }
}

// ── Labels ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Where someone is, for "Akiva is reading Exodus 3": the ref decoded from the first path segment of their snapshot url ("/Exodus.3?lang=bi"
 * → "Exodus 3"). Not a canonical title (that would need the API); good enough to recognise. Null for the home page or a non-path.
 */
export function locationLabel(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/")) return null;
  const first = url.split(/[?#]/, 1)[0]!.split("/").filter(Boolean)[0];
  if (!first) return null;
  const label = urlToRef(first).trim();
  return label || null;
}

/** "Guest" and a short suffix from the participant id, so two guests can tell each other apart. */
export function guestName(participantId: ParticipantId): string {
  return `Guest ${participantId.slice(-3).toUpperCase()}`;
}

/** `<roomUrl>/r/<id>`, only for ws: and wss: URLs (anything else in the config is a mistake, and the in-browser room is used). */
export function roomSocketUrl(roomUrl: string | undefined, sessionId: string): string | null {
  if (!roomUrl || !/^wss?:\/\/[^/]+/i.test(roomUrl)) return null;
  return `${roomUrl.replace(/\/+$/, "")}/r/${sessionId}`;
}
