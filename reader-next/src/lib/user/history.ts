/**
 * Reading history and saved items ("Save" / bookmarks), as the old client keeps them (static/js/sefaria/sefaria.js
 * saveUserHistory / toggleSavedItem / getSavedItem; server reader/views.py profile_sync_api, user_history_api).
 *
 * Signed in, both go to `POST /api/profile/sync?no_return=1` with one form field, `user_history` = a JSON array of items:
 *  - a history item: {ref, versions, book, language, time_stamp[, secondary]} (with `annotate=1` in the query, no `client`);
 *  - a save toggle: {ref, versions, time_stamp, action: "add_saved" | "delete_saved"} plus `client=web`; the answer's `created`
 *    holds the saved record.
 * The saved list is read with `GET /api/profile/user_history?saved=1&secondary=0&annotate=0` (the old page had it in its props).
 * Signed out, history goes to the `user_history` cookie (newest first, at most 3000 bytes encoded), which the server reads for
 * anonymous history requests; saving opens the sign-up modal.
 *
 * Writes carry the session cookie and `X-CSRFToken` (src/lib/auth/http.ts), same origin.
 *
 * @feature USL-010 Reading history logging
 * @feature USL-002 @feature USL-012
 * @feature USL-011 Save (bookmark) button
 * @feature USL-001 @feature USL-009
 */
import { queryOptions } from "@tanstack/react-query";
import { postForm, sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";

/** The old `currVersions` shape: per pseudo-language (he = the source, en = the translation), or null. */
export interface LegacyVersion {
  versionTitle: string;
  languageFamilyName: string;
}
export type LegacyVersions = { en: LegacyVersion | null; he: LegacyVersion | null };

export interface HistoryItem {
  ref: string;
  versions: LegacyVersions;
  book?: string;
  language?: "bilingual" | "english" | "hebrew";
  time_stamp?: number;
  secondary?: boolean;
  he_ref?: string;
}

/** A saved record as the server returns it. */
export interface SavedRecord {
  ref: string;
  he_ref?: string;
  book?: string;
  versions?: Partial<Record<"en" | "he", LegacyVersion | string | null>>;
  time_stamp?: number;
  saved?: boolean;
}

const one = (api: string | undefined): LegacyVersion | null => {
  if (!api) return null;
  const i = api.indexOf("|");
  return i < 0 ? null : { versionTitle: api.slice(i + 1), languageFamilyName: api.slice(0, i) };
};

/** This client's versions ("family|Title" per side) → the old currVersions. */
export const legacyVersions = (v: { primary?: string; translation?: string } = {}): LegacyVersions => ({ en: one(v.translation), he: one(v.primary) });

const now = () => Math.floor(Date.now() / 1000);

/** The old areVersionsEqual: versionTitle and languageFamilyName per side; a version may be an old-style string; missing = "". */
export function versionsEqual(a: SavedRecord["versions"] | LegacyVersions | undefined, b: SavedRecord["versions"] | LegacyVersions | undefined): boolean {
  const norm = (v: LegacyVersion | string | null | undefined) =>
    typeof v === "string" ? { versionTitle: v, languageFamilyName: "" } : { versionTitle: v?.versionTitle ?? "", languageFamilyName: v?.languageFamilyName ?? "" };
  return (["en", "he"] as const).every((l) => {
    const x = norm(a?.[l]), y = norm(b?.[l]);
    return x.versionTitle === y.versionTitle && x.languageFamilyName === y.languageFamilyName;
  });
}

/** The old getSavedItem: the saved record for this ref in these versions. */
export const findSaved = (saved: readonly SavedRecord[], item: { ref: string; versions: LegacyVersions }) =>
  saved.find((s) => s.ref === item.ref && versionsEqual(s.versions, item.versions));

// ── signed in ────────────────────────────────────────────────────────────────────────────────────────────

/** Record history items (the old saveUserHistory, signed in). */
export async function syncHistory(items: HistoryItem[]): Promise<void> {
  const stamped = items.map((i) => ({ ...i, time_stamp: i.time_stamp ?? now() }));
  await postForm("/api/profile/sync?no_return=1&annotate=1", new URLSearchParams({ user_history: JSON.stringify(stamped) }));
}

/** Save or un-save (the old toggleSavedItem). Resolves to the server's record when one was created, else null. Throws on failure. */
export async function setSaved(item: { ref: string; versions: LegacyVersions }, saved: boolean): Promise<SavedRecord | null> {
  const body = { ref: item.ref, versions: item.versions, time_stamp: now(), action: saved ? "add_saved" : "delete_saved" };
  const res = await postForm("/api/profile/sync?no_return=1", new URLSearchParams({ user_history: JSON.stringify([body]), client: "web" }));
  const data = res.data as { error?: string; created?: SavedRecord[] };
  if (!res.ok || data.error) throw new Error(data.error ?? `Could not ${saved ? "save" : "remove"} (HTTP ${res.status})`);
  return saved && data.created?.length ? data.created[0]! : null;
}

/** The reader's saved items (signed in only; `enabled` decides). */
export const savedItemsQuery = (uid: number | null) =>
  queryOptions({
    queryKey: ["user", "saved", uid] as const,
    queryFn: async ({ signal }): Promise<SavedRecord[]> => {
      const r = await fetch(sameOrigin("/api/profile/user_history?saved=1&secondary=0&annotate=0&limit=1000"), { credentials: "same-origin", signal });
      if (!r.ok) throw new Error(`Saved items: HTTP ${r.status}`);
      const data = (await r.json()) as SavedRecord[] | { error?: string };
      return Array.isArray(data) ? data : [];
    },
    enabled: uid !== null,
    staleTime: 60_000,
    gcTime: POLICIES.user.gcTime,
  });

// ── signed out ───────────────────────────────────────────────────────────────────────────────────────────

export const ANON_HISTORY_COOKIE = "user_history";
export const MAX_ANON_HISTORY_BYTES = 3000;

/** The old _trimUserHistoryForCookie: newest first, the longest prefix whose encoded JSON fits the budget. */
export function trimForCookie(items: HistoryItem[]): HistoryItem[] {
  let n = items.length;
  while (n > 0 && encodeURIComponent(JSON.stringify(items.slice(0, n))).length > MAX_ANON_HISTORY_BYTES) n--;
  return items.slice(0, n);
}

function readAnonHistory(): HistoryItem[] {
  const m = document.cookie.split("; ").find((c) => c.startsWith(`${ANON_HISTORY_COOKIE}=`));
  if (!m) return [];
  try {
    const v = JSON.parse(decodeURIComponent(m.slice(ANON_HISTORY_COOKIE.length + 1)));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Signed out: the newest items first in the `user_history` cookie (secondary items are not kept). */
export function saveAnonHistory(items: HistoryItem[]): void {
  if (typeof document === "undefined") return;
  const fresh = items.filter((i) => !i.secondary).map((i) => ({ ...i, time_stamp: i.time_stamp ?? now() }));
  if (!fresh.length) return;
  const all = trimForCookie([...fresh, ...readAnonHistory()]);
  document.cookie = `${ANON_HISTORY_COOKIE}=${encodeURIComponent(JSON.stringify(all))}; path=/`;
}
