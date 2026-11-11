/**
 * Where the topics pages get the topics TOC and the site's topic counts, without the browser ever downloading the whole tree.
 *
 * The old pages had the TOC in every page (`DJANGO_DATA_VARS.topic_toc`, templates/js/data.js, ~2 MB of the 9 MB data.js) and
 * the count of library topics in the page's props (`numLibraryTopics`, reader/views.py base_props). This client keeps them on the
 * server, once for all requests (an hour), and hands each page only its slice through server functions:
 *  - the TOC from `GET /api/topics-toc` (this branch's Django); where that endpoint is missing (sefaria.org answers 404) from the
 *    same JSON inside `GET /data.js`;
 *  - the library count from `GET /api/topics/library-count` (this branch's Django); where missing, from the number the old topics
 *    page writes into its HTML (`"numLibraryTopics": N`); where that fails too, no number (the placeholder reads "Search Topics A-Z").
 *
 * @feature TOP-001 Topic URLs and legacy redirects
 * @feature TOP-013 Topic category page
 * @feature TOP-031 Topic pool and trending endpoints
 */
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { isSafeSegment, isSafeText, oneOf, record, segment, text } from "~/lib/server-fn/input";
import { findTopicTocNode, topicTocCategoryPaths, topicTocPage, type TopicTocEntry, type TopicTocNode } from "./topic-toc";
import { azSlice, type AzLang, type TopicListItem } from "./topic-model";

const TTL_MS = 60 * 60_000;
/** The big answers (data.js is 9.4 MB, the topic list 2.9 MB) get longer than the API's 8 s on the server; they are fetched once an hour. */
const BIG = { deadlineMs: 30_000 } as RequestInit; // src/server/internal-fetch.ts reads deadlineMs; the browser ignores it
/**
 * Django's LanguageSettingsMiddleware may redirect a page request (data.js, /topics: not under /api/) to the other language's domain;
 * it never redirects its own "sefaria-node" user agent (the old Node server's), nor one with the English interface cookie.
 */
const PAGE: RequestInit = { ...BIG, headers: { "user-agent": "sefaria-node (reader-next)", cookie: "interfaceLang=english" } };

/** The JSON value after `topic_toc:` in the old data.js (a JS object literal whose values are JSON). */
export function topicTocFromDataJs(src: string): TopicTocNode[] {
  const at = src.indexOf("topic_toc:");
  if (at < 0) throw new Error("data.js has no topic_toc");
  let i = at + "topic_toc:".length;
  while (/\s/.test(src[i] ?? "")) i++;
  if (src[i] !== "[") throw new Error("data.js topic_toc is not a list");
  // a balanced scan over the JSON array (strings may hold brackets)
  let depth = 0;
  let inString = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (inString) {
      if (c === "\\") j++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(src.slice(i, j + 1)) as TopicTocNode[];
    }
  }
  throw new Error("data.js topic_toc is cut short");
}

/** The tree: the API where it exists, else the old data.js. */
export async function fetchTopicTocTree(origin = SEFARIA_API_ORIGIN, fetcher: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<TopicTocNode[]> {
  const r = await fetcher(`${origin}/api/topics-toc`);
  if (r.ok) return (await r.json()) as TopicTocNode[];
  await r.body?.cancel().catch(() => undefined);
  if (r.status !== 404) throw new SefariaApiError(`Topic TOC: HTTP ${r.status}`, r.status);
  const d = await fetcher(`${origin}/data.js`, PAGE);
  if (!d.ok) throw new SefariaApiError(`Topic TOC (data.js): HTTP ${d.status}`, d.status);
  return topicTocFromDataJs(await d.text());
}

/** The number in `"numLibraryTopics": 5768` (the old page's props). */
export const numLibraryTopicsFromHtml = (html: string): number | null => {
  const m = /"numLibraryTopics":\s*(\d+)/.exec(html);
  return m ? Number(m[1]) : null;
};

export async function fetchNumLibraryTopics(origin = SEFARIA_API_ORIGIN, fetcher: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<number | null> {
  try {
    const r = await fetcher(`${origin}/api/topics/library-count`);
    if (r.ok) {
      const n = ((await r.json()) as { count?: unknown }).count;
      if (typeof n === "number") return n;
    } else await r.body?.cancel().catch(() => undefined);
    const page = await fetcher(`${origin}/topics`, PAGE);
    return page.ok ? numLibraryTopicsFromHtml(await page.text()) : null;
  } catch {
    return null;
  }
}

/** The A–Z list (`GET /api/topics?limit=0`: every displayable topic of the library, most sources first; 2.9 MB). */
export async function fetchTopicList(origin = SEFARIA_API_ORIGIN, fetcher: typeof fetch = (...a) => globalThis.fetch(...a)): Promise<TopicListItem[]> {
  const r = await fetcher(`${origin}/api/topics?limit=0`, BIG);
  if (!r.ok) throw new SefariaApiError(`Topic list: HTTP ${r.status}`, r.status);
  return (await r.json()) as TopicListItem[];
}

/** One promise per hour, shared by every request on this server; a failure is not kept. */
function serverCached<T>(load: () => Promise<T>): () => Promise<T> {
  let held: { at: number; value: Promise<T> } | undefined;
  return () => {
    const now = Date.now();
    if (!held || now - held.at > TTL_MS) {
      const value = load();
      const entry = { at: now, value };
      held = entry;
      value.catch(() => {
        if (held === entry) held = undefined;
      });
    }
    return held.value;
  };
}

const serverToc = serverCached(() => fetchTopicTocTree());
const serverCount = serverCached(() => fetchNumLibraryTopics());
const serverList = serverCached(() => fetchTopicList());
const serverListSlugs = serverCached(async () => new Set((await serverList()).map((t) => t.slug)));

/** Server only: the topics TOC this server keeps (an hour). For other server functions (the single topic page). */
export const serverTopicToc = (): Promise<TopicTocNode[]> => serverToc();
/** Server only: the slugs of the A–Z list (the library's displayable topics: library pool, should_display(3, textual only)). */
export const serverListedTopicSlugs = (): Promise<Set<string>> => serverListSlugs();

export interface TopicTocPageData {
  /** The category's own titles (the page's h1); null for the top level. */
  title: { en: string; he: string } | null;
  entries: TopicTocEntry[];
  /** Slugs of the top level (the old Sefaria.isTopicTopLevel, which the subtopic sort reads). */
  topLevel: string[];
  /** The slugs of the categories above this one, outermost first (the page's data-anl-panel_category). */
  path: string[];
}

/** A category's page of the TOC, or null when the slug is not a category there. */
/** readTopicTocPage's input: "" (the landing's top level) or a category slug (one segment, bounded; looked up, never a path). */
export function validateTopicTocSlug(slug: unknown): string {
  return slug === "" ? "" : segment(slug, "category slug", 200);
}

/** readAzSlice's input: a letter as the address has it (bounded text) and "en" or "he". */
export function validateAzSliceInput(d: unknown): { letter: string; lang: AzLang } {
  const o = record(d, "topics A-Z");
  return { letter: text(o.letter, "letter", 20), lang: oneOf(o.lang, ["en", "he"] as const, "lang") };
}

const readTopicTocPage = createServerFn({ method: "GET" })
  .validator(validateTopicTocSlug)
  .handler(async ({ data: slug }): Promise<TopicTocPageData | null> => {
    const toc = await serverToc();
    const entries = topicTocPage(toc, slug || undefined);
    if (!entries) return null;
    const node = slug ? findTopicTocNode(toc, slug) : undefined;
    const paths = slug ? topicTocCategoryPaths(toc) : {};
    const path = slug && Object.hasOwn(paths, slug) ? (paths[slug] ?? []).map((c) => c.slug) : [];
    return { title: node ? node.primaryTitle : null, entries, topLevel: toc.map((n) => n.slug), path };
  });

export interface TopicTocIndex {
  /** slug → the slugs of the categories above it, outermost first. */
  paths: Record<string, string[]>;
  /** category slug → its titles. */
  titles: Record<string, { en: string; he: string }>;
}

const readTopicTocIndex = createServerFn({ method: "GET" }).handler(async (): Promise<TopicTocIndex> => {
  const paths = topicTocCategoryPaths(await serverToc());
  const out: TopicTocIndex = { paths: {}, titles: {} };
  for (const [slug, cats] of Object.entries(paths)) {
    if (!cats.length) continue;
    out.paths[slug] = cats.map((c) => c.slug);
    for (const c of cats) out.titles[c.slug] ??= { en: c.en, he: c.he };
  }
  return out;
});

const readNumLibraryTopics = createServerFn({ method: "GET" }).handler(async (): Promise<number | null> => serverCount());

const readAzSlice = createServerFn({ method: "GET" })
  .validator(validateAzSliceInput)
  .handler(async ({ data }): Promise<TopicListItem[]> => azSlice(await serverList(), data.letter, data.lang));

/** A page of the topics TOC (the server's tree; the browser asks the server for the slice). Null: not a category. */
export const topicTocPageQueryOptions = (slug = "") =>
  queryOptions<TopicTocPageData | null>({
    ...withPolicy("catalog", { queryKey: ["catalog", "topic-toc-page", slug] as const, queryFn: (): Promise<TopicTocPageData | null> => (slug === "" || isSafeSegment(slug, 200) ? readTopicTocPage({ data: slug }) : Promise.resolve(null)) }),
  });

/** Every topic's category path (the landing search's "(Category > Sub)" after each suggestion). */
export const topicTocIndexQueryOptions = () =>
  queryOptions<TopicTocIndex>({ ...withPolicy("catalog", { queryKey: ["catalog", "topic-toc-index"] as const, queryFn: (): Promise<TopicTocIndex> => readTopicTocIndex() }) });

/** Sefaria.numLibraryTopics: how many topics the library's pool has (the landing search's placeholder). */
export const numLibraryTopicsQueryOptions = () =>
  queryOptions<number | null>({ ...withPolicy("catalog", { queryKey: ["catalog", "num-library-topics"] as const, queryFn: (): Promise<number | null> => readNumLibraryTopics() }) });

/** The topics an A–Z letter page lists before any filter (the server's list, filtered and sorted there). */
export const azSliceQueryOptions = (letter: string, lang: AzLang) =>
  queryOptions<TopicListItem[]>({ ...withPolicy("catalog", { queryKey: ["catalog", "topics-az", lang, letter] as const, queryFn: (): Promise<TopicListItem[]> => (isSafeText(letter, 20) ? readAzSlice({ data: { letter, lang } }) : Promise.resolve([])) }) });
