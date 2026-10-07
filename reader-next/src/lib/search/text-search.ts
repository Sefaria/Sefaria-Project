/**
 * Full-text search of the library's texts, as the old client's sidebar "Search in this text" asks for it:
 * `POST /api/search-wrapper/es8`, limited to one book by the path `GET /api/search-path-filter/<title>` returns,
 * naive-lemmatised field, chronological order, 100 hits a page. Hits for the same ref in several versions are merged
 * into one result with the others beneath it. VERIFIED on sefaria.org (Genesis, "light": 112 hits; "אור": 8).
 *
 * Unlike the old client, the first request waits for the path filter (the old one ran an unfiltered search of the
 * whole library first, then the filtered one).
 *
 * @feature SRC-094 Search in this text (sidebar)
 * @feature SRC-096 Sidebar search result display and click
 * @feature SRC-097 Search path filter API
 */
import { infiniteQueryOptions, queryOptions, type InfiniteData } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export const SEARCH_PAGE_SIZE = 100;
/** The longest query the box takes. */
export const MAX_QUERY_LENGTH = 75;

export interface SearchHit {
  _id: string;
  _source: {
    ref: string;
    heRef: string;
    version: string;
    hebrew_version_title?: string;
    lang: string;
    languageFamilyName: string;
    isPrimary: boolean;
    version_priority?: number;
    categories?: string[];
    path?: string;
    exact?: string;
    naive_lemmatizer?: string;
  };
  /** Field → fragments with the matched words in <b>. */
  highlight?: Record<string, string[]>;
}
export interface MergedHit extends SearchHit {
  /** The same ref in other versions, best first. */
  duplicates?: SearchHit[];
}
export interface SearchPage {
  total: number;
  hits: SearchHit[];
}

export const textQueryBody = (query: string, path: string, start = 0) => ({
  aggs: [] as string[],
  field: "naive_lemmatizer",
  filter_fields: ["path"],
  filters: [path],
  query,
  size: SEARCH_PAGE_SIZE,
  slop: 10,
  ...(start ? { start } : {}),
  sort_fields: ["comp_date", "order"],
  sort_method: "sort",
  sort_reverse: false,
  source_proj: true,
  type: "text",
});

/** The search path of a book ("Tanakh/Torah/Genesis"). */
export const searchPathQueryOptions = (title: string) =>
  queryOptions<string>({
    ...withPolicy("catalog", {
      queryKey: ["search", "path-filter", title] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<string> => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/search-path-filter/${encodeURIComponent(title)}`, { signal });
        if (!r.ok) throw new SefariaApiError(`Search path of ${title}: HTTP ${r.status}`, r.status);
        return (await r.json()) as string;
      },
    }),
  });

export async function fetchTextSearchPage(query: string, path: string, start: number, signal?: AbortSignal): Promise<SearchPage> {
  const r = await fetch(`${SEFARIA_API_ORIGIN}/api/search-wrapper/es8`, {
    method: "POST",
    // text/plain keeps this a "simple" cross-origin request: the API's CORS preflight rejects content-type: application/json
    headers: { "content-type": "text/plain" },
    body: JSON.stringify(textQueryBody(query, path, start)),
    signal,
  });
  if (!r.ok) throw new SefariaApiError(`Search for "${query}": HTTP ${r.status}`, r.status);
  const d = (await r.json()) as { hits?: { total?: { value?: number } | number; hits?: SearchHit[] } };
  const total = typeof d.hits?.total === "number" ? d.hits.total : (d.hits?.total?.value ?? 0);
  return { total, hits: d.hits?.hits ?? [] };
}

/** Pages of results for a query inside one book; the next page starts after the hits already loaded. */
export const textSearchQueryOptions = (query: string, path: string) => {
  // Searches are not persisted between visits (cache class "search": maxAge 0), so the persister is left out
  const { persister: _unused, ...policy } = withPolicy("search", { queryKey: ["search", "text", path, query] as const });
  return infiniteQueryOptions<SearchPage, Error, InfiniteData<SearchPage, number>, readonly ["search", "text", string, string], number>({
    ...policy,
    queryFn: ({ pageParam, signal }) => fetchTextSearchPage(query, path, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.hits.length, 0);
      return last.hits.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });
};

/**
 * One result per ref: the version with the lowest `version_priority` leads, the others become its duplicates.
 * Repeated hit ids are dropped (the index returns some twice). Order follows the first hit of each ref.
 */
export function mergeTextResultsVersions(hits: readonly SearchHit[]): MergedHit[] {
  const seen = new Set<string>();
  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    if (seen.has(hit._id)) continue;
    seen.add(hit._id);
    const g = groups.get(hit._source.ref);
    if (g) g.push(hit);
    else groups.set(hit._source.ref, [hit]);
  }
  return [...groups.values()].map((list) => {
    if (list.length === 1) return list[0]!;
    const sorted = [...list].sort((a, b) => (a._source.version_priority ?? 0) - (b._source.version_priority ?? 0));
    return { ...sorted[0]!, duplicates: sorted.slice(1) };
  });
}

const isHebrew = (s: string) => /[֐-׿]/.test(s);

/** The snippet to show: the highlighted fragments joined by "...", leading punctuation dropped (SRC-096). */
export function snippetOf(hit: SearchHit): { html: string; lang: "he" | "en" } {
  const field = hit.highlight ? Object.keys(hit.highlight)[0] : undefined;
  let html = field ? hit.highlight![field]!.join("...") : (hit._source.exact ?? "");
  html = html.replace(/^[ .,;:!\-)\]]+/, "");
  return { html, lang: isHebrew(html) ? "he" : "en" };
}

/** The matched words of a hit, consecutive highlighted words as one phrase (the old getHighlights). */
export function highlightsOf(hit: SearchHit): string[] {
  const values = hit.highlight ? Object.values(hit.highlight) : [];
  if (!values.length) return [];
  const out: string[] = [];
  const re = /((?:[\s,.?!:;])*<b>[^<]+<\/b>[\s,.?!:;]*)+/g;
  for (const fragment of values[0]!) {
    for (const m of fragment.matchAll(re)) out.push(m[0].replace(/<\/?b>/g, ""));
  }
  return out;
}
