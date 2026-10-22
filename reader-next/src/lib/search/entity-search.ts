/**
 * Searching for books, authors and topics by name: `GET /api/entity-search?q=…&type=book|author|topic&start=…&sort=…`.
 * VERIFIED on sefaria.org ("light": 1 book — Ohr Chadash, 1 author — Maharal, 21 topics).
 *
 * @feature SRC-066 Books, Authors and Topics result tabs
 * @feature SRC-067 Entity search client and paging
 * @feature SRC-073 Entity search API
 */
import { infiniteQueryOptions, queryOptions, type InfiniteData } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { SITE_ORIGIN } from "~/lib/config";

export type EntityType = "book" | "author" | "topic";
export interface EntityHit {
  slug?: string;
  subtype?: string;
  title_en: string;
  title_he: string;
  description_en?: string;
  description_he?: string;
  /** Books */
  categories?: string[];
  path?: string;
  authors?: string[];
  compDate?: number | number[];
  era?: string;
  /** Authors */
  birthYear?: number | string;
  deathYear?: number | string;
  /** Books: the names of the first author (English and Hebrew) and, on rows the server made up, their own link. */
  author_names?: string[];
  url?: string;
  isCategory?: boolean;
  categoryLabel_en?: string;
  categoryLabel_he?: string;
}
export interface EntityResponse {
  hits: EntityHit[];
  total: number;
  categoryCounts?: Record<string, number>;
}

export const entitySearchQueryOptions = (q: string, type: EntityType, start = 0, sort = "relevance") =>
  queryOptions<EntityResponse>({
    ...withPolicy("search", {
      queryKey: ["entity-search", q, type, start, sort] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<EntityResponse> => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/entity-search?${new URLSearchParams({ q, type, start: String(start), sort })}`, { signal });
        if (!r.ok) throw new SefariaApiError(`Entity search: HTTP ${r.status}`, r.status);
        return (await r.json()) as EntityResponse;
      },
    }),
  });

/** Beyond ten thousand the count reads "10,000+". */
export const formatEntityCount = (n: number): string => (n >= 10000 ? "10,000+" : n.toLocaleString("en-US"));

/** The link of an entity: a book to its page, an author or topic to the library's topic page. */
export function entityHref(type: EntityType, hit: EntityHit): string {
  if (type === "book") return `/${(hit.path ?? hit.title_en).split("/").pop()!.replace(/ /g, "_")}`;
  return `${SITE_ORIGIN}/topics/${hit.slug}`;
}

/** Pages of entity results, 20 or so at a time: the next starts after the hits already loaded (capped at ten thousand). */
export const entitySearchInfiniteOptions = (q: string, type: EntityType, sort = "relevance", filters: readonly string[] = []) => {
  const { persister: _unused, ...policy } = withPolicy("search", { queryKey: ["entity-search-pages", q, type, sort, filters] as const });
  return infiniteQueryOptions<EntityResponse, Error, InfiniteData<EntityResponse, number>, readonly ["entity-search-pages", string, EntityType, string, readonly string[]], number>({
    ...policy,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ q, type, start: String(pageParam), sort });
      for (const f of filters) params.append("filter", f);
      const r = await fetch(`${SEFARIA_API_ORIGIN}/api/entity-search?${params}`, { signal });
      if (!r.ok) throw new SefariaApiError(`Entity search: HTTP ${r.status}`, r.status);
      return (await r.json()) as EntityResponse;
    },
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.hits.length, 0);
      return last.hits.length > 0 && loaded < Math.min(last.total, 10000) ? loaded : undefined;
    },
  });
};
