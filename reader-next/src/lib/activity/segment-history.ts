/**
 * A text's revision history (`/activity/<ref>/<lang>/<version>[/<page>]?type=<filter>`), the old templates/activity.html with
 * elements/activity_feed.html, read from `GET /api/activity/<ref>/<lang>/<version>?type=&page=` (reader/views.py
 * segment_history_api, this branch's Django: sefaria.org renders the page from a template and has no JSON for it yet — until it
 * does, the API's 404 makes the page a 404 here, which the server passes to Django).
 *
 * @feature LEG-019 Text edit activity feed (/activity): a text's revision history
 */
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { decodeHTML } from "entities";
import { SEFARIA_API_ORIGIN, SefariaApiError, apiJson } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

/** JSON as the API sent it (an index or term change's `new` / `old`). */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface ActivityRef {
  en: string;
  he: string;
  /** "/Genesis.1.1"; null when the ref no longer parses (the old page printed it without a link). */
  url: string | null;
}

export interface ActivityItem {
  rev_type: string;
  date: string | null;
  user: { name: string; profileUrl: string } | null;
  method?: string | null;
  ref: ActivityRef | null;
  title: ActivityRef | null;
  version?: string | null;
  versionHe?: string | null;
  language?: string | null;
  diff_html?: string | null;
  history_url?: string | null;
  summary: boolean;
  updates_count?: number | null;
  linkRefs: (ActivityRef | null)[];
  noteRef: ActivityRef | null;
  new: { [k: string]: Json } | null;
  old: { [k: string]: Json } | null;
  score?: number | null;
  comment?: string | null;
  sheet?: number | null;
}

export interface SegmentHistory {
  ref: string;
  heRef: string;
  url: string;
  lang: string;
  version: string;
  versionTitleInHebrew: string;
  filterType: string | null;
  page: number;
  hasMore: boolean;
  items: ActivityItem[];
}

export interface SegmentHistoryAddress {
  /** The ref as written in the address ("Genesis.1.1"). */
  ref: string;
  lang: string;
  /** The version title as written in the address (underscores for spaces, as the old links wrote it). */
  version: string;
  page: number;
}

/**
 * The address's parts, as urls_library.py reads them: `activity/(?P<tref>.+?)/(?P<lang>.{2})/(?P<version>.+)(/(?P<page>\d+))?`
 * (the ref is the shortest first part followed by a two-letter language). Null when the path is not one.
 */
export function parseSegmentHistoryPath(splat: string): SegmentHistoryAddress | null {
  const m = /^(.+?)\/(.{2})\/(.+?)(?:\/(\d+))?$/.exec(splat);
  if (!m) return null;
  const [, ref, lang, version, page] = m;
  if (!ref || !lang || !version || version.includes("/")) return null;
  return { ref, lang, version, page: page ? Math.max(1, Number(page)) : 1 };
}

/** The address of a page of the history ("Older Activity »" and the filter keep the ref and version as the server normalised them). */
export function segmentHistoryHref(h: Pick<SegmentHistory, "url" | "lang" | "version">, page: number, filterType: string | null | undefined): string {
  const base = `/activity${h.url}/${h.lang}/${encodeURIComponent(h.version.replace(/ /g, "_"))}${page > 1 ? `/${page}` : ""}`;
  return filterType ? `${base}?type=${encodeURIComponent(filterType)}` : base;
}

/** The old page's filter menu (activity.html #activityFilter), value → label. */
export const ACTIVITY_FILTERS: readonly { value: string; en: string; he: string }[] = [
  { value: "", en: "All Activity", he: "היסטוריית פעילות" },
  { value: "translate", en: "Translations", he: "תרגומים" },
  { value: "publish_sheet", en: "Source Sheets", he: "דפי מקורות" },
  { value: "add_text", en: "New Texts", he: "טקסטים חדשים" },
  { value: "edit_text", en: "Edits", he: "עריכות" },
  { value: "add_note", en: "Notes", he: "הערות" },
  { value: "review", en: "Reviews", he: "ביקורות גולשים" },
  { value: "index_change", en: "Text Info", he: "מידע אודות הטקסט" },
  { value: "version_metadata", en: "Version Metadata", he: "Version Metadata" },
  { value: "revert_text", en: "Reversions", he: "שחזורים" },
  { value: "flagged", en: "Flagged", he: "מסומנים" },
];

export type DiffPart = { kind: "ins" | "del" | "same"; text: string };

/**
 * A diff as diff_match_patch's diff_prettyHtml wrote it into the history (`<ins style=…>…</ins>`, `<del …>`, `<span>`, newlines as
 * `&para;<br>`, the texts' own markup escaped), read into parts so the page renders it without putting stored HTML into the page.
 */
export function parseDiffHtml(html: string): DiffPart[] {
  const parts: DiffPart[] = [];
  const re = /<(ins|del|span)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  let last = 0;
  const push = (kind: DiffPart["kind"], raw: string) => {
    const text = decodeHTML(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""));
    if (text) parts.push({ kind, text });
  };
  while ((m = re.exec(html))) {
    if (m.index > last) push("same", html.slice(last, m.index));
    push(m[1] === "ins" ? "ins" : m[1] === "del" ? "del" : "same", m[2] ?? "");
    last = m.index + m[0].length;
  }
  if (last < html.length) push("same", html.slice(last));
  return parts;
}

/** The sentence's verb for an item, as activity_feed.html chose it (Hebrew: locale/he django.po; untranslated ones stay English, as there). */
export function activityVerb(item: Pick<ActivityItem, "rev_type" | "version">): { en: string; he: string } {
  const t = item.rev_type;
  const V: Record<string, { en: string; he: string }> = {
    "delete index": { en: "deleted the text", he: "מחק את הטקסט" },
    "delete text": { en: "deleted a text version of", he: "מחק את גרסת הטקסט של" },
    "add text": { en: "added", he: "נוסף" },
    "edit text": { en: "edited", he: "נערך" },
    "revert text": { en: "reverted", he: "שוחזר" },
    "add link": { en: "added a connection", he: "קישור לטקסט אחר" },
    "edit link": { en: "edited a connection", he: "ערך קישור" },
    "delete link": { en: "deleted a connection", he: "מחק קישור" },
    "add note": { en: "added a note to", he: "הוסיף הערה ל" },
    "edit note": { en: "edited a note on", he: "ערך הערה ב" },
    "delete note": { en: "deleted a note on", he: "מחק הערה ב" },
    "add index": { en: "added text info for the text", he: "הוסיף מידע אודות הטקסט" },
    "edit index": { en: "edited the text info of", he: "ערך מידע אודות הטקסט" },
    "edit version_metadata": { en: "edited version metadata for", he: "edited version metadata for" },
    "add term": { en: "added a term", he: "הוסיף מונח" },
    "edit term": { en: "edited the term", he: "ערך את המונח" },
    "delete term": { en: "deleted the term", he: "מחק את המונח" },
    "add lexicon_entry": { en: "added a lexicon entry", he: "added a lexicon entry" },
    "edit lexicon_entry": { en: "edited the lexicon entry", he: "edited the lexicon entry" },
    "delete lexicon_entry": { en: "deleted the lexicon entry", he: "deleted the lexicon entry" },
    review: { en: "reviewed", he: "בחן שינויים בטקסט" },
    "publish sheet": { en: "published a new Source Sheet", he: "פרסם דף מקורות חדש" },
  };
  if (t === "add text" && item.version === "Sefaria Community Translation") return { en: "translated", he: "תורגם" };
  return V[t] ?? { en: t, he: t };
}

const UNITS: [number, string, string][] = [
  [365 * 24 * 3600, "year", "years"],
  [30 * 24 * 3600, "month", "months"],
  [7 * 24 * 3600, "week", "weeks"],
  [24 * 3600, "day", "days"],
  [3600, "hour", "hours"],
  [60, "minute", "minutes"],
];

/** Django's naturaltime for a past date: "now", "5 minutes ago", "2 years, 3 months ago" (timesince, two units). Hebrew: one unit. */
export function naturalTime(iso: string | null | undefined, lang: "en" | "he", now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  let s = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (!Number.isFinite(s)) return "";
  if (s < 60) return lang === "he" ? "עכשיו" : "now";
  if (lang === "he") {
    const rtf = new Intl.RelativeTimeFormat("he", { numeric: "always" });
    const unit = UNITS.find(([size]) => s >= size)!;
    return rtf.format(-Math.floor(s / unit[0]), unit[1] as Intl.RelativeTimeFormatUnit);
  }
  const out: string[] = [];
  for (const [size, one, many] of UNITS) {
    if (out.length === 2) break;
    const n = Math.floor(s / size);
    if (n > 0) {
      out.push(`${n} ${n === 1 ? one : many}`);
      s -= n * size;
    } else if (out.length) break; // timesince stops at the first empty unit after the first
  }
  return `${out.join(", ")} ago`;
}

export const readSegmentHistory = createServerFn({ method: "GET" })
  .validator((d: { ref: string; lang: string; version: string; page: number; type?: string }) => d)
  .handler(async ({ data }): Promise<SegmentHistory | null> => {
    const q = new URLSearchParams({ page: String(data.page), ...(data.type ? { type: data.type } : {}) });
    const path = `/api/activity/${data.ref.split("/").map(encodeURIComponent).join("/")}/${encodeURIComponent(data.lang)}/${encodeURIComponent(data.version)}?${q}`;
    const r = await fetch(`${SEFARIA_API_ORIGIN}${path}`, { deadlineMs: 30_000 } as RequestInit);
    if (r.status === 404) return null;
    try {
      return await apiJson<SegmentHistory>(r, `Revision history ${data.ref}`);
    } catch (e) {
      if (e instanceof SefariaApiError && e.status === 404) return null;
      throw e;
    }
  });

/** The history page. Search class: memory only (it changes with every edit). */
export const segmentHistoryQueryOptions = (a: SegmentHistoryAddress, type: string | undefined) =>
  queryOptions<SegmentHistory | null>({
    ...withPolicy("search", {
      queryKey: ["activity", a.ref, a.lang, a.version, a.page, type ?? ""] as const,
      queryFn: (): Promise<SegmentHistory | null> => readSegmentHistory({ data: { ...a, ...(type ? { type } : {}) } }),
    }),
    retry: false,
  });
