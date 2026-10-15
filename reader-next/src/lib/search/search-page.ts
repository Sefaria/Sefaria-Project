/**
 * The search page's logic: its URL, the request it sends, the filter tree built from the aggregations, and the selection
 * model of that tree. Ported from the old SearchState / search.js / FilterNode and checked against sefaria.org
 * (query "light": 10,000+ sources, tree of 14 top categories, 100 hits a page).
 *
 * @feature SRC-040 Search URL parameters
 * @feature SRC-045 SearchState model
 * @feature SRC-046 Sources full-text search results
 * @feature SRC-052 Exact phrase vs all results toggle
 * @feature SRC-053 Sources sort dropdown
 * @feature SRC-079 Search request body and caching
 * @feature SRC-080 Query construction and ranking
 * @feature SRC-083 Filter tree construction
 * @feature SRC-084 FilterNode selection model
 */
import { infiniteQueryOptions, queryOptions, type InfiniteData } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { isCategory, type TocNode } from "~/lib/catalog/toc";
import type { SearchHit } from "./text-search";
import { adaptDictaHits, dictaSearchBody, fetchDictaBooks, fetchDictaSearch, isDictaQuery, mergeBuckets, type ScoredHit } from "./dicta";

export type SearchTab = "sources" | "books" | "authors" | "topics";
export type SearchSort = "relevance" | "chronological";
export const SEARCH_PAGE_SIZE = 100;

export interface SearchParams {
  q: string;
  tab: SearchTab;
  sort: SearchSort;
  /** Exact phrase (the `exact` field, slop 0) instead of all results (lemmatised, slop 10). */
  exact: boolean;
  /** Applied path filters: category paths ("Tanakh") and book paths ("Tanakh/Torah/Genesis"). */
  filters: string[];
}

const TABS: readonly SearchTab[] = ["sources", "books", "authors", "topics"];

/** `?q=light&tab=text&search_tab=sources&tvar=1&tsort=relevance&tpathFilters=Tanakh|Mishnah` → params. */
export function parseSearchParams(raw: Record<string, unknown>): SearchParams {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const tab = TABS.includes(s("search_tab") as SearchTab) ? (s("search_tab") as SearchTab) : "sources";
  const filters = (s("tpathFilters") ?? "").split("|").filter(Boolean);
  return { q: s("q") ?? "", tab, sort: s("tsort") === "chronological" ? "chronological" : "relevance", exact: s("tvar") === "0", filters };
}

/** Params → the old site's query string (all of tab, search_tab, tvar and tsort are written, filters only when applied). */
export function searchParamsToQuery(p: SearchParams): Record<string, string> {
  return {
    q: p.q,
    tab: "text",
    search_tab: p.tab,
    tvar: p.exact ? "0" : "1",
    tsort: p.sort,
    ...(p.filters.length ? { tpathFilters: p.filters.join("|") } : {}),
  };
}

export const searchHref = (p: SearchParams): string => `/search?${new URLSearchParams(searchParamsToQuery(p))}`;

/** The request body (`POST /api/search-wrapper/es8`). `aggs` asks for the category tree; hits can be switched off with size 0. */
export function textSearchBody(p: SearchParams, opts: { start?: number; size?: number; aggs?: boolean; filtered?: boolean } = {}) {
  const filters = opts.filtered === false ? [] : p.filters;
  return {
    aggs: opts.aggs ? ["path"] : [],
    field: p.exact ? "exact" : "naive_lemmatizer",
    filter_fields: filters.map(() => "path"),
    filters,
    query: p.q.replace(/(\S)"(\S)/g, "$1״$2"), // רמב"ם → רמב״ם
    size: opts.size ?? SEARCH_PAGE_SIZE,
    slop: p.exact ? 0 : 10,
    ...(opts.start ? { start: opts.start } : {}),
    ...(p.sort === "chronological"
      ? { sort_fields: ["comp_date", "order"], sort_method: "sort", sort_reverse: false }
      : { sort_fields: ["pagesheetrank"], sort_method: "score", sort_reverse: false, sort_score_missing: 0.04 }),
    source_proj: true,
    type: "text",
  };
}

export interface SearchResponse {
  total: number;
  /** "gte": more than `total` (shown as 10,000+). */
  relation: "eq" | "gte";
  hits: SearchHit[];
  buckets: { key: string; doc_count: number }[];
  /** Hebrew "All Results": Dicta's Tanakh verses for this page (undefined when Dicta is not asked or did not answer). */
  dicta?: { total: number; hits: ScoredHit[] };
}

export async function fetchSearch(body: object, signal?: AbortSignal): Promise<SearchResponse> {
  // text/plain keeps the cross-origin request "simple" (see text-search.ts)
  const r = await fetch(`${SEFARIA_API_ORIGIN}/api/search-wrapper/es8`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(body), signal });
  if (!r.ok) throw new SefariaApiError(`Search: HTTP ${r.status}`, r.status);
  const d = (await r.json()) as { hits?: { total?: { value?: number; relation?: string } | number; hits?: SearchHit[] }; aggregations?: { path?: { buckets?: { key: string; doc_count: number }[] } } };
  const t = d.hits?.total;
  return {
    total: typeof t === "number" ? t : (t?.value ?? 0),
    relation: typeof t === "object" && t?.relation === "gte" ? "gte" : "eq",
    hits: d.hits?.hits ?? [],
    buckets: d.aggregations?.path?.buckets ?? [],
  };
}

/**
 * The category tree comes from an unfiltered query (so the counts stay whole while filters are applied): no hits wanted. For a
 * Hebrew "All Results" query its Tanakh counts are Dicta's (SRC-082); `dicta: {total: -1}` marks that Dicta did not answer.
 */
export const searchTreeQueryOptions = (p: SearchParams) =>
  queryOptions<SearchResponse>({
    ...withPolicy("search", {
      queryKey: ["search", "tree", p.q, p.exact] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const sefaria = fetchSearch(textSearchBody({ ...p, filters: [] }, { size: 0, aggs: true }), signal);
        if (!isDictaQuery(p.q, p.exact)) return sefaria;
        const [s, books] = await Promise.all([sefaria, fetchDictaBooks(p.q, signal).catch(() => null)]);
        return books ? { ...s, buckets: mergeBuckets(s.buckets, books), dicta: { total: books.reduce((t, b) => t + b.doc_count, 0), hits: [] } } : { ...s, dicta: { total: -1, hits: [] } };
      },
    }),
  });

type PageParam = { s: number; d: number };

/** Pages of results for the page's query, filters and sort; the next starts after the hits loaded. */
export const searchResultsQueryOptions = (p: SearchParams) => {
  const { persister: _unused, ...policy } = withPolicy("search", { queryKey: ["search", "results", p.q, p.exact, p.sort, p.filters] as const });
  const dicta = isDictaQuery(p.q, p.exact);
  return infiniteQueryOptions<SearchResponse, Error, InfiniteData<SearchResponse, PageParam>, readonly ["search", "results", string, boolean, SearchSort, string[]], PageParam>({
    ...policy,
    queryFn: async ({ pageParam, signal }) => {
      const sefaria = pageParam.s < 0 ? Promise.resolve<SearchResponse>({ total: 0, relation: "eq", hits: [], buckets: [] }) : fetchSearch(textSearchBody(p, { start: pageParam.s }), signal);
      if (!dicta || pageParam.d < 0) return sefaria;
      // Dicta pages run beside Sefaria's (the old client's Promise.all); a Dicta failure leaves Sefaria's own results
      const [s, d] = await Promise.all([
        sefaria,
        fetchDictaSearch(dictaSearchBody(p.q, { from: pageParam.d, size: SEARCH_PAGE_SIZE, filters: p.filters, sort: p.sort }), signal).catch(() => null),
      ]);
      return d ? { ...s, dicta: { total: d.total, hits: adaptDictaHits(d.hits, pageParam.d) } } : s;
    },
    initialPageParam: { s: 0, d: 0 },
    getNextPageParam: (last, all) => {
      const sLoaded = all.reduce((n, pg) => n + pg.hits.length, 0);
      const sMore = last.hits.length > 0 && sLoaded < last.total;
      const dLoaded = all.reduce((n, pg) => n + (pg.dicta?.hits.length ?? 0), 0);
      const dMore = !!last.dicta && last.dicta.hits.length > 0 && dLoaded < last.dicta.total;
      return sMore || dMore ? { s: sMore ? sLoaded : -1, d: dMore ? dLoaded : -1 } : undefined;
    },
  });
};

/** "10,000+" for a capped total; with Dicta's verses added, "10,182+" (the old SearchTotal.asString: the number, then "+" if capped). */
export const countLabel = (total: number, relation: "eq" | "gte"): string => `${total.toLocaleString("en-US")}${relation === "gte" ? "+" : ""}`;

// ── the filter tree ───────────────────────────────────────────────────────────────────────────────

export interface FilterNode {
  /** The path this node filters by ("Tanakh", "Tanakh/Torah/Genesis"). */
  key: string;
  title: string;
  heTitle: string;
  count: number;
  /** Books below a top category, flattened (the old panel shows leaves only). */
  children: FilterNode[];
}

/**
 * The order the filter tree lists things in, as a rank per path: library order, except that categories with a `searchRoot`
 * (the commentaries, Targum) are moved to the end under that name ("Tanakh Commentary/Rishonim on Tanakh/Rashi"), as the old
 * `_cacheFromToc` / `compareSearchCatPaths` did. Paths the catalog does not give are not in the map. (VERIFIED: live lists
 * Targum, Tanakh Commentary, Mishnah Commentary, Talmud Commentary after Reference.)
 */
export function catalogOrder(tree: readonly TocNode[]): Map<string, number> {
  const slots = new Map<string, number[]>();
  // The rewrite state carries on to the siblings that follow, as in the old recursion (its parameters are reassigned in the loop).
  const walk = (nodes: readonly TocNode[], parentPath: string, parentOrder: number[], from: string, to: string) => {
    nodes.forEach((n, i) => {
      let order = [...parentOrder, i];
      const path = (parentPath ? parentPath + "/" : "") + (isCategory(n) ? n.category : n.title);
      if (isCategory(n) && n.searchRoot) {
        from = path;
        to = `${n.searchRoot}/${n.category}`;
        order = [100, ...order];
        slots.set(to, order);
      } else if (from) {
        slots.set(path.replace(new RegExp("^" + from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), to), order);
      } else slots.set(path, order);
      if (isCategory(n) && n.contents) walk(n.contents, path, order, from, to);
    });
  };
  walk(tree, "", [], "", "");
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
  };
  const ranked = [...slots.entries()].sort((x, y) => cmp(x[1], y[1]));
  return new Map(ranked.map(([k], i) => [k, i]));
}

/**
 * Buckets ("Kabbalah/Zohar/Zohar": 887) → the top-level categories with their books beneath, in library order, counts summed
 * from the books. Applied filters stay in the tree even when the aggregation has no bucket for them; paths the catalog does
 * not know are dropped.
 */
export function buildFilterTree(buckets: readonly { key: string; doc_count: number }[], applied: readonly string[], order: ReadonlyMap<string, number>, he: (name: string) => string): FilterNode[] {
  const leaves = new Map<string, number>();
  for (const b of buckets) leaves.set(b.key, b.doc_count);
  for (const a of applied) if (a.includes("/") && !leaves.has(a)) leaves.set(a, 0);
  const tops = new Map<string, FilterNode>();
  // A top-level name can be a made-up root ("Tanakh Commentary"): known if some path starts with it, ranked by the first of those
  const rank = new Map<string, number>();
  for (const [k, r] of order) { const t = k.split("/")[0]!; rank.set(t, Math.min(rank.get(t) ?? Number.MAX_SAFE_INTEGER, r)); }
  const topOrder = (k: string) => rank.get(k) ?? Number.MAX_SAFE_INTEGER;
  for (const [key, count] of leaves) {
    if (!order.has(key) && !order.has(key.split("/").slice(0, -1).join("/"))) continue; // not in the catalog (yet)
    const parts = key.split("/");
    const top = parts[0]!;
    if (!rank.has(top)) continue;
    const node = tops.get(top) ?? { key: top, title: top, heTitle: he(top), count: 0, children: [] };
    node.count += count;
    if (parts.length > 1) node.children.push({ key, title: parts.at(-1)!, heTitle: parts.at(-1)!, count, children: [] });
    tops.set(top, node);
  }
  if (applied.includes("") === false) for (const a of applied) if (!a.includes("/") && rank.has(a) && !tops.has(a)) tops.set(a, { key: a, title: a, heTitle: he(a), count: 0, children: [] });
  const list = [...tops.values()].sort((a, b) => topOrder(a.key) - topOrder(b.key));
  for (const n of list) n.children.sort((a, b) => (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER));
  return list;
}

export type Selection = "none" | "selected" | "partial";

/** A node's state given the applied filters: selected itself (or through its category), partly (some books), or not. */
export function selectionOf(node: FilterNode, applied: readonly string[]): Selection {
  if (applied.includes(node.key) || applied.some((a) => node.key.startsWith(a + "/"))) return "selected";
  if (node.children.length && node.children.some((c) => selectionOf(c, applied) === "selected")) return "partial";
  return "none";
}

/** Toggling a node: a partly or fully selected one is cleared, an unselected one selected; the applied list stays minimal. */
export function toggleFilter(node: FilterNode, applied: readonly string[], tree: readonly FilterNode[]): string[] {
  const state = selectionOf(node, applied);
  const parent = tree.find((t) => t.children.some((c) => c.key === node.key));
  let next = [...applied];
  if (state === "none") {
    next.push(node.key);
    // all of a category's books selected one by one = the category
    if (parent && parent.children.every((c) => next.includes(c.key))) next = [...next.filter((a) => !parent.children.some((c) => c.key === a)), parent.key];
  } else if (parent && applied.includes(parent.key)) {
    // one book off a selected category: the category becomes its other books
    next = [...applied.filter((a) => a !== parent.key), ...parent.children.filter((c) => c.key !== node.key).map((c) => c.key)];
  } else {
    // a category (or book) cleared, with whatever of it was selected below
    next = applied.filter((a) => a !== node.key && !a.startsWith(node.key + "/"));
  }
  return next;
}

/** Does the filter box's text match: the node, one of its books, or it is selected. */
export function matchesFilterText(node: FilterNode, text: string, applied: readonly string[]): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  const plainHe = (s: string) => s.replace(/[\u0591-\u05c7]/g, "");
  const hit = (s: string) => plainHe(s).toLowerCase().split(/[\s\-\u05be]+/).some((w) => w.startsWith(plainHe(t))); // a word starting with the text, vowels ignored
  // Hebrew too: the old box deleted Hebrew letters from the text and so matched everything (SRC-087); here it matches Hebrew titles
  return hit(node.title) || hit(node.heTitle) || node.children.some((c) => hit(c.title) || hit(c.heTitle)) || selectionOf(node, applied) !== "none";
}

// ── Books, Authors and Topics ────────────────────────────────────────────────────────────────────────────────────

export type EntitySort = "relevance" | "year_asc" | "year_desc" | "alpha";
export interface SortOption<V extends string = string> { value: V; en: string; he: string }
const RELEVANCE = { value: "relevance", en: "Relevance", he: "רלוונטיות" } as const;
const ALPHA = { value: "alpha", en: "A-Z", he: "א-ת" } as const;
/** The sorts of each entity tab (the server sorts the whole match set; VERIFIED sefaria.org, SRC-068). */
export const ENTITY_SORTS: Record<"book" | "author" | "topic", SortOption<EntitySort>[]> = {
  book: [RELEVANCE, { value: "year_asc", en: "Composition Date (Oldest First)", he: "תאריך חיבור (ישן לחדש)" }, { value: "year_desc", en: "Composition Date (Newest First)", he: "תאריך חיבור (חדש לישן)" }, ALPHA],
  author: [RELEVANCE, { value: "year_asc", en: "Year (Oldest First)", he: "שנה (ישן לחדש)" }, { value: "year_desc", en: "Year (Newest First)", he: "שנה (חדש לישן)" }, ALPHA],
  topic: [RELEVANCE, ALPHA],
};

/** "1204 CE" / "500 BCE" (and the Hebrew forms), from a signed year. */
export function formatYear(year: number | string | null | undefined): { en: string; he: string } | null {
  if (year === null || year === undefined || year === "") return null;
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  const abs = Math.abs(y);
  return y < 0 ? { en: `${abs} BCE`, he: `${abs} לפנה״ס` } : { en: `${abs} CE`, he: `${abs} לספירה` };
}

/** An author's years: "1135 – 1204 CE", "500 BCE – 20 CE", or the one year known. */
export function authorLifespan(hit: { birthYear?: number | string; deathYear?: number | string }): { en: string; he: string } | null {
  const b = hit.birthYear === undefined || hit.birthYear === "" ? null : Number(hit.birthYear);
  const d = hit.deathYear === undefined || hit.deathYear === "" ? null : Number(hit.deathYear);
  if (b === null || d === null) return formatYear(b ?? d);
  const birth = formatYear(b)!, death = formatYear(d)!;
  if (b < 0 === d < 0) return { en: `${Math.abs(b)} – ${death.en}`, he: `${Math.abs(b)} – ${death.he}` };
  return { en: `${birth.en} – ${death.en}`, he: `${birth.he} – ${death.he}` };
}

/**
 * The Books tab's category tree: each top category of the catalog with its sub-categories (one level), counted over
 * the whole match set (`categoryCounts`, unaffected by what is filtered or loaded). Empty ones are hidden unless applied.
 */
export function buildBookFilterTree(catalog: readonly TocNode[], counts: Readonly<Record<string, number>> | undefined, applied: readonly string[]): FilterNode[] {
  if (!counts) return [];
  const out: FilterNode[] = [];
  for (const top of catalog) {
    if (!isCategory(top)) continue;
    const count = counts[top.category] ?? 0;
    if (!count && !applied.includes(top.category)) continue;
    const children: FilterNode[] = [];
    for (const sub of top.contents ?? []) {
      if (!isCategory(sub)) continue;
      const key = `${top.category}/${sub.category}`;
      const c = counts[key] ?? 0;
      if (c || applied.includes(key)) children.push({ key, title: sub.category, heTitle: sub.heCategory, count: c, children: [] });
    }
    out.push({ key: top.category, title: top.category, heTitle: top.heCategory, count, children });
  }
  return out;
}

/** The Sources sorts, as options. */
export const SOURCE_SORTS: SortOption<SearchSort>[] = [{ value: "relevance", en: "Relevance", he: "רלוונטיות" }, { value: "chronological", en: "Chronological", he: "כרונולוגי" }];
