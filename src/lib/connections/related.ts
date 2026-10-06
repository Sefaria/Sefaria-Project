/**
 * Everything attached to a section besides its links: sheets, topics, manuscripts, Torah-reading audio and
 * guides (`/api/related/<section>?with_sheet_links=1`, as the old client requests it), grouped by the verse each
 * item is anchored to, plus the web pages (`/api/related/<ref>/websites`). Fetched when the Resources view is
 * open; cached like links. Counts follow the old ConnectionsPanel exactly.
 *
 * @feature CON-014 Resources list (sheets, web pages, topics, manuscripts, readings)
 * @feature CON-071 Related data API and caching
 */
import { queryOptions } from "@tanstack/react-query";
import { related } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

interface Anchored {
  anchorRef?: string;
  anchorRefExpanded?: string[];
}
export interface RelatedSheet extends Anchored { id: string | number; title?: string; owner?: number; sheetUrl?: string }
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

/** The counts on the Resources rows for the selected verses. Old ConnectionsPanel `resourcesButtonCounts`. */
export function resourceCounts(res: SectionResources | undefined, refs: readonly string[], extra: { webpages: number | null; translations: number }): ResourceCounts {
  const sheets = new Set(pick(res?.sheets ?? {}, refs).map((s) => String(s.id))).size; // spanning anchors duplicate
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
  const result = await related.getRelated({ client: getSefariaClient(), path: { tref: sectionRef }, query: { with_sheet_links: "1" } as never, signal });
  const raw = unwrap(result, `Related to ${sectionRef}`) as unknown as RawRelated;
  // Links are not kept here (the links query has them); only what the Resources rows need is cached.
  return {
    sheets: groupByRef(raw.sheets?.map(({ id, title, owner, sheetUrl, anchorRef, anchorRefExpanded }) => ({ id, title, owner, sheetUrl, anchorRef, anchorRefExpanded }))),
    topics: groupByRef(raw.topics),
    manuscripts: groupByRef(raw.manuscripts),
    media: groupByRef(raw.media),
    guides: groupByRef(raw.guides),
  };
}

export const resourcesQueryOptions = (sectionRef: string) =>
  queryOptions<SectionResources>({
    ...withPolicy("connections", {
      queryKey: ["resources", sectionRef] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSectionResources(sectionRef, signal),
    }),
  });
