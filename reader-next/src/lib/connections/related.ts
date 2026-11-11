/**
 * Everything attached to a section besides its links: sheets, topics, manuscripts, Torah-reading audio and
 * guides (`/api/related/<section>?with_links=0&sheets=count`: no links, sheets as id + anchors only), grouped by the verse each
 * item is anchored to, plus the web pages (`/api/related/<ref>/websites`). Fetched when the Resources view is
 * open; cached like links. Counts follow the old ConnectionsPanel exactly.
 *
 * @feature CON-014 Resources list (sheets, web pages, topics, manuscripts, readings)
 * @feature CON-071 Related data API and caching
 */
import { queryOptions } from "@tanstack/react-query";
import { related } from "@vendor/sefaria-toolkit/client/runtime";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { POLICIES } from "~/lib/cache/policies";
import { sameOrigin } from "~/lib/auth/http";
import { refToUrl } from "~/lib/ref/url";

interface Anchored {
  anchorRef?: string;
  anchorRefExpanded?: string[];
}
/** A sheet as `sheets=count` answers it: only what counting needs (the Sheets row opens Voices; nothing lists them here). */
export interface RelatedSheet extends Anchored { id: string | number }
export interface RelatedTopic extends Anchored { topic: string; title?: { en: string; he: string }; order?: { pr?: number } }
export type RelatedItem = Anchored & Record<string, unknown>;

/** Items grouped by the segment refs they are anchored to (an item anchored to a range is under each verse). */
export type ByRef<T> = Record<string, T[]>;

export interface SectionResources {
  sheets: ByRef<RelatedSheet>;
  topics: ByRef<RelatedTopic>;
  manuscripts: ByRef<RelatedItem>;
  media: ByRef<RelatedItem>;
  guides: ByRef<RelatedItem>;
}

/** "Genesis 1:3-5" → ["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"] (within one section; else the ref itself). */
export function expandRange(ref: string): string[] {
  const m = /^(.*?)(\d+[ab]?):(\d+)-(\d+)$/.exec(ref);
  if (!m) return [ref];
  const [, head, section, from, to] = m;
  const out: string[] = [];
  for (let i = Number(from); i <= Number(to) && out.length < 500; i++) out.push(`${head}${section}:${i}`);
  return out;
}

/** Old `_saveItemsByRef`: each item filed under every verse it covers. */
export function groupByRef<T extends Anchored>(items: readonly T[] | undefined): ByRef<T> {
  const out: ByRef<T> = {};
  for (const item of items ?? []) {
    if (!item.anchorRef) continue;
    for (const r of item.anchorRefExpanded ?? expandRange(item.anchorRef)) (out[r] ??= []).push(item);
  }
  return out;
}

const pick = <T>(by: ByRef<T>, refs: readonly string[]): T[] => refs.flatMap((r) => by[r] ?? []);

export interface ResourceCounts {
  sheets: number;
  /** null until loaded: shown without a number, as the old panel did. */
  webpages: number | null;
  audio: number;
  topics: number;
  manuscripts: number;
  guides: number;
  translations: number;
}

/**
 * The counts on the Resources rows for the selected verses. Old ConnectionsPanel `resourcesButtonCounts`.
 * Sheets: the public sheets on the verses plus, signed in, the reader's own (private ones too) without counting their public sheets
 * twice (old Sefaria.sheets.sheetsTotalCount).
 */
export function resourceCounts(
  res: SectionResources | undefined,
  refs: readonly string[],
  extra: { webpages: number | null; translations: number; mine?: { uid: number; sheets: ByRef<RelatedSheet> } },
): ResourceCounts {
  const publicSheets = pick(res?.sheets ?? {}, refs);
  // the reader's public sheets are in both lists under the same id: one set of ids counts each once (public sheets come as ids and
  // anchors only, SB-03, so there is no owner to filter on)
  const all = extra.mine ? [...pick(extra.mine.sheets, refs), ...publicSheets] : publicSheets;
  const sheets = new Set(all.map((s) => String(s.id))).size; // spanning anchors duplicate
  const topics = new Set(pick(res?.topics ?? {}, refs).map((t) => t.topic)).size;
  return {
    sheets,
    webpages: extra.webpages,
    audio: pick(res?.media ?? {}, refs).length,
    topics,
    manuscripts: pick(res?.manuscripts ?? {}, refs).length,
    guides: pick(res?.guides ?? {}, refs).length,
    translations: extra.translations,
  };
}

interface RawRelated {
  sheets?: RelatedSheet[];
  topics?: RelatedTopic[];
  manuscripts?: RelatedItem[];
  media?: RelatedItem[];
  guides?: RelatedItem[];
}

export async function fetchSectionResources(sectionRef: string, signal?: AbortSignal): Promise<SectionResources> {
  const result = await related.getRelated({ client: getSefariaClient(), path: { tref: sectionRef }, query: { with_links: "0", sheets: "count" } as never, signal });
  const raw = unwrap(result, `Related to ${sectionRef}`) as unknown as RawRelated;
  // Links are not kept here (the links query has them); only what the Resources rows need is cached.
  return {
    sheets: groupByRef(raw.sheets?.map(({ id, anchorRef, anchorRefExpanded }) => ({ id, anchorRef, anchorRefExpanded }))),
    topics: groupByRef(raw.topics),
    manuscripts: groupByRef(raw.manuscripts),
    media: groupByRef(raw.media),
    guides: groupByRef(raw.guides),
  };
}

/**
 * The signed-in reader's own sheets (private ones too) on a section: /api/related/<ref>?private=1 (old Sefaria.relatedPrivate), for the
 * Sheets count. Same-origin with the session cookie; an error or a signed-out answer counts as none.
 */
export const privateSheetsQueryOptions = (uid: number | null, sectionRef: string) =>
  queryOptions<ByRef<RelatedSheet>>({
    queryKey: ["user", "related-private", uid, sectionRef] as const,
    queryFn: async ({ signal }) => {
      const r = await fetch(sameOrigin(`/api/related/${refToUrl(sectionRef)}?private=1`), { credentials: "same-origin", signal });
      if (!r.ok) return {};
      const data = (await r.json()) as { sheets?: RelatedSheet[]; error?: string };
      return groupByRef(data.sheets?.map(({ id, anchorRef, anchorRefExpanded }) => ({ id, anchorRef, anchorRefExpanded })));
    },
    enabled: uid !== null,
    staleTime: 30_000,
    gcTime: POLICIES.user.gcTime,
  });

/**
 * The Resources rows' data. The request is never aborted (its AbortSignal is not passed on): a query whose function reads the
 * signal is cancelled and reset when its last observer goes, so opening the sidebar (where the pane mounts twice) aborted the first
 * `/api/related` and sent it again, and closing the sidebar before it answered threw it away for the next opening to send once more
 * (V-EXITS SB-05: one `/api/related` refetch over three in-page reopens). Left to finish, the answer lands in the cache, and the next
 * observer joins the request in flight. A reload still asks again: connections are kept in memory only.
 */
export const resourcesQueryOptions = (sectionRef: string) =>
  queryOptions<SectionResources>({
    ...withPolicy("connections", {
      queryKey: ["resources", sectionRef] as const,
      queryFn: () => fetchSectionResources(sectionRef),
    }),
  });
