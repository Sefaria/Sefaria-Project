/**
 * The Saved / History / Notes page's data (the old UserHistoryPanel.jsx and NoteListing.jsx; reader/views.py saved_content,
 * user_history_content and notes, all `@login_required`).
 *
 *  - Saved and History: `GET /api/profile/user_history?saved=1|0&sheets_only=0&secondary=0&annotate=1&skip=<n>&limit=<n>`, read a page
 *    at a time as the reader scrolls (the old useScrollToLoad, 20 at a time). `annotate=1` adds each text's sized string (`text.en`,
 *    `text.he`) or a sheet's listing data (title, owner…). History is shown without consecutive items of the same book (dedupeItems).
 *  - History off: the profile's `settings.reading_history` (the old page had Sefaria.is_history_enabled from the server), read from
 *    `GET /api/profile/<slug>`, which gives the settings to the profile's owner only (profile_api).
 *  - Notes: `GET /api/notes/all?private=1` (all_notes_api: the reader's notes, newest first). Delete: lib/user/notes.ts deleteNote.
 *
 * Requests go to the page's own origin with the session cookie, as the sidebar's saved items and notes do.
 *
 * @feature USL-008 Saved items and reading history pages
 * @feature USL-003 My Notes page
 * @feature USL-005 Private notes list
 */
import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import { sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";
import { encodeVtitle } from "~/lib/reader/url-state";
import { refToUrl } from "~/lib/ref/url";
import { profileSlug } from "./textual-custom";

export type UserHistoryTab = "saved" | "history" | "notes";

/** The tabs' addresses, as the old title bar wrote them. */
export const TAB_HREF: Record<UserHistoryTab, string> = { saved: "/saved", history: "/history", notes: "/texts/notes" };

type ItemVersion = { versionTitle?: string; languageFamilyName?: string } | string | null;

/** A Saved or History item as `annotate=1` returns it. */
export interface UserHistoryEntry {
  ref: string;
  he_ref?: string;
  book?: string;
  versions?: Partial<Record<"en" | "he", ItemVersion>>;
  time_stamp?: number;
  is_sheet?: boolean;
  sheet_id?: number;
  /** A sheet's title (get_sheet_listing_data). */
  title?: string;
  ownerName?: string;
  ownerProfileUrl?: string;
  /** A text's sized string per direction (en = ltr, he = rtl). */
  text?: { en?: string; he?: string };
}

/** How many items a request reads (the old useScrollToLoad's page). */
export const PAGE_SIZE = 20;

export const userHistoryUrl = (tab: "saved" | "history", skip: number, limit = PAGE_SIZE) =>
  `/api/profile/user_history?${new URLSearchParams({ saved: tab === "saved" ? "1" : "0", sheets_only: "0", secondary: "0", annotate: "1", skip: String(skip), limit: String(limit) })}`;

/** Saved or History, a page at a time (the next page starts after what was read; a short page is the last). */
export const userHistoryQuery = (uid: number | null, tab: "saved" | "history") =>
  infiniteQueryOptions({
    queryKey: ["user", "history-page", uid, tab] as const,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<UserHistoryEntry[]> => {
      const r = await fetch(sameOrigin(userHistoryUrl(tab, pageParam)), { credentials: "same-origin", signal });
      if (!r.ok) throw new Error(`${tab}: HTTP ${r.status}`);
      const data = (await r.json()) as UserHistoryEntry[] | { error?: string };
      return Array.isArray(data) ? data : [];
    },
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.reduce((n, p) => n + p.length, 0)),
    enabled: uid !== null,
    staleTime: 0,
    gcTime: POLICIES.user.gcTime,
  });

/** The old dedupeItems: no two consecutive items of the same book. */
export function dedupeItems<T extends { book?: string }>(items: readonly T[]): T[] {
  const out: T[] = [];
  let prev: string | undefined | symbol = Symbol("none");
  for (const item of items) {
    if (item.book !== prev) {
      out.push(item);
      prev = item.book;
    }
  }
  return out;
}

/** Whether the reader keeps a reading history (the profile's `reading_history`, on unless set to false). */
export const readingHistoryEnabled = (profile: unknown): boolean => (profile as { settings?: { reading_history?: unknown } } | null)?.settings?.reading_history !== false;

export const readingHistoryQuery = (profileUrl: string | undefined) => {
  const slug = profileSlug(profileUrl);
  return queryOptions({
    queryKey: ["user", "reading-history-enabled", slug ?? ""] as const,
    queryFn: async ({ signal }): Promise<boolean> => {
      if (!slug) return true;
      try {
        const r = await fetch(sameOrigin(`/api/profile/${encodeURIComponent(slug)}`), { credentials: "same-origin", signal });
        return r.ok ? readingHistoryEnabled(await r.json()) : true;
      } catch {
        return true;
      }
    },
    staleTime: 5 * 60_000,
    gcTime: POLICIES.user.gcTime,
  });
};

/** A note as all_notes_api returns it. */
export interface NoteEntry {
  _id: string;
  ref: string;
  text: string;
}

export const allNotesQuery = (uid: number | null) =>
  queryOptions({
    queryKey: ["user", "all-notes", uid] as const,
    queryFn: async ({ signal }): Promise<NoteEntry[]> => {
      const r = await fetch(sameOrigin("/api/notes/all?private=1"), { credentials: "same-origin", signal });
      if (!r.ok) throw new Error(`Notes: HTTP ${r.status}`);
      const data = (await r.json()) as NoteEntry[] | { error?: string };
      return Array.isArray(data) ? data.map(({ _id, ref, text }) => ({ _id, ref, text })) : [];
    },
    enabled: uid !== null,
    staleTime: 0,
    gcTime: POLICIES.user.gcTime,
  });

const SHEET_REF_RE = /^Sheet (\d+(?:[.:]\d+)*)$/;

/**
 * Where a note's citation leads (NoteListing getNoteLink): a text's verse with the Notes tool open, `/<ref>?with=Notes`; a note on a
 * sheet ("Sheet 3.4") goes to `/sheets/3.4` (on Voices, the old client's data-target-module).
 */
export function noteHref(ref: string): string {
  const sheet = SHEET_REF_RE.exec(ref);
  if (sheet) return `/sheets/${sheet[1]!.replace(/:/g, ".")}`;
  return `/${refToUrl(ref)}?with=Notes`;
}

/** A text item's address with its versions (the old TextPassage: "/" + normRef + getUrlVersionsParams). */
export function passageHref(item: Pick<UserHistoryEntry, "ref" | "versions">): string {
  const params = (["en", "he"] as const)
    .map((l) => {
      const v = item.versions?.[l];
      if (!v || typeof v === "string" || !v.versionTitle) return null;
      return `v${l}=${encodeURIComponent(v.languageFamilyName ?? "")}|${encodeURIComponent(encodeVtitle(v.versionTitle))}`;
    })
    .filter(Boolean);
  return `/${refToUrl(item.ref)}${params.length ? `?${params.join("&")}` : ""}`;
}

const SHORT: Record<"en" | "he", Record<string, string>> = {
  en: { y: "y", mo: "mo", w: "w", d: "d", h: "h", m: "m", s: "s" },
  he: { y: "ש'", mo: "ח'", w: "שב'", d: "י'", h: "שע'", m: "דק'", s: "שנ'" },
};
const UNITS: [string, number][] = [
  ["y", 365 * 86400],
  ["mo", 30 * 86400],
  ["w", 7 * 86400],
  ["d", 86400],
  ["h", 3600],
  ["m", 60],
  ["s", 1],
];

/**
 * The old Sefaria.util.naturalTime(time_stamp, {short: true}): the time since, in its largest unit, rounded ("5m", "3d"; Hebrew
 * "3 י'"). `now` in epoch seconds.
 */
export function naturalTimeShort(timeStamp: number, lang: "en" | "he", now = Math.floor(Date.now() / 1000)): string {
  const secs = Math.max(0, now - timeStamp);
  const [unit, size] = UNITS.find(([, s]) => secs >= s) ?? ["s", 1];
  return `${Math.round(secs / size)}${lang === "en" ? "" : " "}${SHORT[lang][unit]}`;
}
