/**
 * The single topic page's data: the adapter between the API's answers and the reader-owned types of topic-page.ts.
 *
 *  - The topic (`GET /api/v2/topics/<slug>?annotate_time_period=1&ref_link_type_filters=…&with_html=1&with_links=1&annotate_links=1
 *    &with_refs=1&group_related=1&with_indexes=1`, Sefaria.getTopic with with_html, byte for byte; an author directly under
 *    "Authors" asks only for `popular-writing-of`) is read **on the server**, which trims it (Moses: 683 KB → the fields the page
 *    uses), adds what the old client read from the 9 MB data.js and the 3.5 MB catalogue (the category above the topic, its
 *    subtopics, each source's book and categories) and decides whether the page is the Library's (see readTopicPage).
 *  - The sources' texts (`GET /api/bulktext/<refs>?asSizedString=true&minChar=500&maxChar=600[&transLangPref=…]`, 70 refs at a
 *    time, split where the URL would pass 3800 characters), the parasha's next reading (`/api/calendars/next-read/<parasha>`) and a
 *    partner portal (`/api/portals/<slug>`) are read where the page is (server render, then the browser).
 *  - The moderators' writes go through lib/auth/http (CSRF): Generate (`POST /api/topics/generate-prompts/<slug>`), Publish
 *    (`POST /api/ref-topic-links/bulk`), mark reviewed (`POST /api/ref-topic-links/<ref>`).
 *
 * @feature TOP-015 Topic page data loading
 * @feature TOP-021 Topic source incremental loading
 * @feature TOP-026 Parasha readings panel
 * @feature TOP-027 Portal topic pages
 * @feature TOP-028 AI-generated topic text disclosure and admin prompt tools
 */
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError, apiJson } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { postJson } from "~/lib/auth/http";
import { sanitizeHtml } from "~/lib/html/sanitize";
import { isCategory, serverCatalogTree, type TocNode } from "~/lib/catalog/toc";
import { serverListedTopicSlugs, serverTopicToc } from "./toc-source";
import { topicTocCategoryPaths, topicTocPage, type TopicTocNode } from "./topic-toc";
import type { AzLang } from "./topic-model";
import {
  LEARN_MORE_KEYS,
  legacyNormRef,
  normalizeOrder,
  type IndexMeta,
  type ParashaReading,
  type RefLinkGroup,
  type SourceText,
  type TopicLinkGroup,
  type TopicPageModel,
  type TopicSource,
} from "./topic-page";

// ------------------------------------------------------------------------------------------------------------- API shapes (here only)

interface ApiDescription {
  title?: string;
  prompt?: string;
  ai_title?: string;
  ai_context?: string;
  published?: boolean;
  review_state?: string;
}
interface ApiRefLink {
  ref: string;
  is_sheet?: boolean;
  order?: Record<string, unknown>;
  descriptions?: { en?: ApiDescription; he?: ApiDescription };
}
interface ApiIntraLink {
  topic: string;
  title: { en: string; he: string };
  order?: { tfidf?: number };
  shouldDisplay?: boolean;
  pools?: string[];
  isCategory?: boolean;
}
interface ApiTopic {
  slug?: string;
  primaryTitle?: { en: string; he: string };
  description?: { en?: string; he?: string };
  image?: { image_uri?: string; image_caption?: { en?: string; he?: string } };
  ref?: { en: string; he: string; url: string };
  parasha?: string;
  portal_slug?: string;
  properties?: Record<string, { value?: string }>;
  timePeriod?: { name?: { en?: string; he?: string }; yearRange?: { en?: string; he?: string } };
  links?: Record<string, { title: { en: string; he: string }; pluralTitle?: { en: string; he: string }; shouldDisplay?: boolean; links: ApiIntraLink[] }>;
  refs?: Record<string, { refs: ApiRefLink[]; shouldDisplay?: boolean }>;
  indexes?: { url: string; title: { en: string; he: string }; description?: { en?: string; he?: string } }[];
  numSources?: number;
  shouldDisplay?: boolean;
  data_source?: string;
  /** This branch's Django adds the topic's pools (sefaria.org does not, yet). */
  pools?: string[];
}

/** Sefaria._CAT_REF_LINK_TYPE_FILTER_MAP: an author directly under Authors shows only its Top Citations on the Library. */
export const refLinkTypeFilters = (categorySlug: string | undefined) => (categorySlug === "authors" ? ["popular-writing-of"] : ["about", "popular-writing-of"]);

/** The old getTopic URL, byte for byte. */
export const topicApiPath = (slug: string, filters: readonly string[]) =>
  `/api/v2/topics/${encodeURIComponent(slug)}?annotate_time_period=1&ref_link_type_filters=${filters.join("|")}&with_html=1&with_links=1&annotate_links=1&with_refs=1&group_related=1&with_indexes=1`;

// ------------------------------------------------------------------------------------------------------------- books of the sources

/** Book title → its categories, primary category and that category's Hebrew name, from the catalogue tree. */
export function indexLookup(tree: readonly TocNode[]): { books: Map<string, IndexMeta> } {
  const books = new Map<string, IndexMeta>();
  const heCats = new Map<string, string>();
  const walk = (nodes: readonly TocNode[]) => {
    for (const n of nodes) {
      if (isCategory(n)) {
        heCats.set(n.category, n.heCategory);
        walk(n.contents ?? []);
      } else {
        const primary = n.primary_category ?? n.categories[0];
        books.set(n.title, { categories: n.categories, ...(primary ? { primaryCategory: primary } : {}) });
      }
    }
  };
  walk(tree);
  for (const meta of books.values()) {
    const he = meta.primaryCategory ? heCats.get(meta.primaryCategory) : undefined;
    if (he) meta.heCategory = he;
  }
  return { books };
}

/**
 * The book a ref belongs to (the old Sefaria.parseRef(ref).index): the longest known title that the ref starts with, ending at a
 * space or a comma ("Zohar, Shemot 51:376" → Zohar; "Moses; A Human Life, 2 The Murmuring Deep 35-37" → "Moses; A Human Life").
 */
export function bookOfRef(ref: string, books: ReadonlyMap<string, unknown>): string | undefined {
  if (books.has(ref)) return ref;
  for (let i = ref.length - 1; i > 0; i--) {
    if ((ref[i] === " " || ref[i] === ",") && books.has(ref.slice(0, i))) return ref.slice(0, i);
  }
  return undefined;
}

// -------------------------------------------------------------------------------------------------------------- the page, trimmed

const trimDescription = (d: ApiDescription | undefined) =>
  d
    ? {
        ...(d.title ? { title: d.title } : {}),
        ...(d.prompt ? { prompt: d.prompt } : {}),
        ...(d.ai_title ? { ai_title: d.ai_title } : {}),
        ...(d.published !== undefined ? { published: d.published } : {}),
        ...(d.review_state ? { review_state: d.review_state } : {}),
        ...(d.ai_context ? { hasAiContext: true } : {}),
      }
    : undefined;

/** The API's topic → the page model (sheets left out: the Library's tabs never list them). */
export function topicPageModel(
  t: ApiTopic,
  ctx: { slug: string; tocPaths: Record<string, { slug: string; en: string; he: string }[]>; toc: readonly TopicTocNode[]; books: ReadonlyMap<string, IndexMeta>; listed: boolean },
): TopicPageModel {
  const cats = ctx.tocPaths[ctx.slug] ?? [];
  const category = cats.at(-1);
  const indexes: Record<string, IndexMeta> = {};
  const refs: RefLinkGroup[] = Object.entries(t.refs ?? {}).map(([linkType, g]) => ({
    linkType,
    refs: g.refs
      .filter((r) => !r.is_sheet)
      .map((r): TopicSource => {
        const index = bookOfRef(r.ref, ctx.books);
        if (index && !indexes[index]) indexes[index] = ctx.books.get(index)!;
        const en = trimDescription(r.descriptions?.en), he = trimDescription(r.descriptions?.he);
        const order = normalizeOrder(r.order as never);
        return { ref: r.ref, ...(order ? { order } : {}), ...(en || he ? { descriptions: { ...(en ? { en } : {}), ...(he ? { he } : {}) } } : {}), ...(index ? { index } : {}) };
      }),
  }));
  const links: TopicLinkGroup[] = Object.values(t.links ?? {}).map((g) => ({
    title: g.title,
    ...(g.pluralTitle ? { pluralTitle: g.pluralTitle } : {}),
    ...(g.shouldDisplay !== undefined ? { shouldDisplay: g.shouldDisplay } : {}),
    links: g.links.map((l) => ({
      topic: l.topic,
      title: l.title,
      hasOrder: !!l.order,
      ...(l.order?.tfidf !== undefined ? { tfidf: l.order.tfidf } : {}),
      ...(l.shouldDisplay !== undefined ? { shouldDisplay: l.shouldDisplay } : {}),
      ...(l.pools ? { pools: l.pools } : {}),
      ...(l.isCategory ? { isCategory: true } : {}),
    })),
  }));
  const props = t.properties ?? {};
  const siblings = (topicTocPage(ctx.toc, category?.slug) ?? []).slice(0, 20).map((e) => ({ slug: e.slug, en: e.primaryTitle.en, he: e.primaryTitle.he }));
  // should_display(MIN_SOURCES_FOR_TOPIC_DISPLAY=3, textual_only): a listed topic passed it; otherwise the same test on what we have
  const indexable = ctx.listed || (t.shouldDisplay !== false && ((t.numSources ?? 0) >= 3 || !!(t.description?.en || t.description?.he) || t.data_source === "sefaria"));
  return {
    slug: ctx.slug,
    primaryTitle: t.primaryTitle ?? { en: ctx.slug, he: ctx.slug },
    ...(t.description ? { description: t.description } : {}),
    ...(t.image?.image_uri ? { image: { uri: t.image.image_uri, caption: t.image.image_caption ?? {} } } : {}),
    ...(t.ref ? { ref: t.ref } : {}),
    ...(t.parasha ? { parasha: t.parasha } : {}),
    ...(t.portal_slug ? { portalSlug: t.portal_slug } : {}),
    learnMore: LEARN_MORE_KEYS.map((k) => ({ title: k.title, titleHe: k.titleHe, ...(props[k.en]?.value ? { en: props[k.en]!.value } : {}), ...(props[k.he]?.value ? { he: props[k.he]!.value } : {}) })),
    ...(t.timePeriod ? { timePeriod: { name: t.timePeriod.name ?? {}, yearRange: t.timePeriod.yearRange ?? {} } } : {}),
    links,
    refs,
    works: (t.indexes ?? []).map((w) => ({ url: w.url, title: w.title, description: w.description ?? {} })),
    ...(category ? { category } : {}),
    siblings,
    panelCategory: cats.map((c) => c.slug).join("|"),
    indexes,
    noindex: !indexable,
  };
}

/** The page, or Django's 404 (a topic that does not exist or is not in the Library's pool). */
export type TopicPageResult = { kind: "page"; page: TopicPageModel } | { kind: "missing" };

/**
 * Whether a topic outside the A–Z list is in the Library's pool, asked of the name completer (`GET /api/name/<title>?type=Topic
 * &topic_pool=library`), which filters by pool on sefaria.org today. Used only when the topic API does not give `pools` (it does
 * on this branch's Django). The English title is asked first, then the Hebrew one; an error is thrown (the page shows its error).
 */
async function inLibraryPool(slug: string, title: { en?: string; he?: string } | undefined): Promise<boolean> {
  for (const name of [title?.en, title?.he]) {
    if (!name) continue;
    const r = await fetch(`${SEFARIA_API_ORIGIN}/api/name/${encodeURIComponent(name)}?limit=50&type=Topic&topic_pool=library`);
    const d = await apiJson<{ completion_objects?: { key?: string }[] }>(r, `Topic pool ${slug}`);
    if (d?.completion_objects?.some((o) => o.key === slug)) return true;
  }
  return false;
}

/**
 * The page, on the server. reader/views.py topic_page answers 404 for a topic that does not exist or is not in the Library's pool.
 * A topic in the A–Z list is in the pool; one that is not (some 300: authors' students, ambiguous names…) is decided by its `pools`
 * where the API gives them (this branch's Django), and otherwise by inLibraryPool. Every Library topic is rendered here, as the
 * opted-in reader must not land in the old client (TOP-036); noindex unless it passes should_display, as on live.
 */
const readTopicPage = createServerFn({ method: "GET" })
  .validator((d: { slug: string; lang: AzLang }) => d)
  .handler(async ({ data }): Promise<TopicPageResult> => {
    const [toc, listed, tree] = await Promise.all([serverTopicToc().catch(() => [] as TopicTocNode[]), serverListedTopicSlugs().catch(() => undefined), serverCatalogTree().catch(() => [] as TocNode[])]);
    const tocPaths = topicTocCategoryPaths(toc);
    const filters = refLinkTypeFilters(tocPaths[data.slug]?.at(-1)?.slug);
    const r = await fetch(`${SEFARIA_API_ORIGIN}${topicApiPath(data.slug, filters)}`, {
      // the server's order of the sources follows the reader's interface language (get_topic's sort_and_group_similar_refs)
      headers: { cookie: `interfaceLang=${data.lang === "he" ? "hebrew" : "english"}` },
      deadlineMs: 30_000, // an uncached big topic takes seconds (Moses: 9 s cold)
    } as RequestInit);
    const t = await apiJson<ApiTopic>(r, `Topic ${data.slug}`);
    if (!t || !t.slug) return { kind: "missing" };
    const inList = listed?.has(t.slug) ?? false;
    if (!inList && !(t.pools ? t.pools.includes("library") : await inLibraryPool(t.slug, t.primaryTitle))) return { kind: "missing" };
    return { kind: "page", page: topicPageModel(t, { slug: t.slug, tocPaths, toc, books: indexLookup(tree).books, listed: inList }) };
  });

/** The topic page in the interface language (the server's source order depends on it). Search class: memory only, five minutes. */
export const topicPageQueryOptions = (slug: string, lang: AzLang) =>
  queryOptions<TopicPageResult>({
    ...withPolicy("search", { queryKey: ["topics", "page", slug, lang] as const, queryFn: (): Promise<TopicPageResult> => readTopicPage({ data: { slug, lang } }) }),
    retry: false,
  });

// ------------------------------------------------------------------------------------------------------------------- the texts

const MAX_URL_LENGTH = 3800;
const HOST_BOUND = 50;

/** Sefaria.partitionArrayForURL: split the refs so each joined, encoded list stays under the limit. */
export function partitionForUrl(refs: readonly string[], limit: number, divider = "|"): string[][] {
  const out: string[][] = [];
  const dividerLength = encodeURIComponent(divider).length;
  let current: string[] = [];
  let length = 0;
  for (const ref of refs) {
    const enc = encodeURIComponent(ref).length;
    const next = current.length === 0 ? enc : length + enc + dividerLength;
    if (next > limit) {
      out.push(current);
      current = [ref];
      length = enc;
      continue;
    }
    current.push(ref);
    length = next;
  }
  if (current.length) out.push(current);
  return out;
}

/** The bulk-text URLs for a chunk of refs (Sefaria.getBulkText(refs, true, 500, 600, transLangPref)). */
export function bulkTextPaths(refs: readonly string[], transLangPref?: string): string[] {
  if (!refs.length) return [];
  const host = encodeURI(`${SEFARIA_API_ORIGIN}/api/bulktext/`);
  const params = encodeURI(`?asSizedString=true&minChar=500&maxChar=600${transLangPref ? `&transLangPref=${transLangPref}` : ""}`);
  const limit = MAX_URL_LENGTH - (host + params).length - HOST_BOUND;
  return partitionForUrl(refs, limit).map((part) => `/api/bulktext/${encodeURIComponent(part.join("|"))}${params}`);
}

/** The texts' HTML through the allowlist sanitizer; a span keeps its class (poetry lines: `poetry indentAll`). */
const TEXT_HTML = { keepAttributes: { span: ["class"] } } as const;

interface ApiBulkText {
  ref?: string;
  heRef?: string;
  en?: string;
  he?: string;
  error?: number;
}

/** One chunk of the topic's sources (70 refs). Text class: the same refs answer the same text. */
export const sourceTextsQueryOptions = (refs: readonly string[], transLangPref?: string) =>
  queryOptions<Record<string, SourceText>>({
    ...withPolicy("text", {
      queryKey: ["topics", "bulktext", transLangPref ?? "", ...refs] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Record<string, SourceText>> => {
        const answers = await Promise.all(bulkTextPaths(refs, transLangPref).map(async (p) => apiJson<Record<string, ApiBulkText>>(await fetch(`${SEFARIA_API_ORIGIN}${p}`, { signal }), "Topic sources")));
        const out: Record<string, SourceText> = {};
        for (const a of answers) {
          for (const [k, v] of Object.entries(a)) {
            const en = v.en ? sanitizeHtml(v.en, TEXT_HTML) : "", he = v.he ? sanitizeHtml(v.he, TEXT_HTML) : "";
            out[k] = v.error ? { ref: k, error: true } : { ref: v.ref ?? k, ...(v.heRef ? { heRef: v.heRef } : {}), ...(en ? { en } : {}), ...(he ? { he } : {}) };
          }
        }
        return out;
      },
    }),
  });

// ------------------------------------------------------------------------------------------------------------ next read and portal

interface ApiNextRead {
  date?: string;
  parasha?: { extraDetails?: { aliyot?: string[] } };
  haftarah?: { url: string; displayValue: { en: string; he: string } }[];
}

/** Sefaria.getParashaNextRead: the next reading of a parasha (Readings in the side column). */
export const nextReadQueryOptions = (parasha: string) =>
  queryOptions<ParashaReading | null>({
    ...withPolicy("search", {
      queryKey: ["topics", "next-read", parasha] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<ParashaReading | null> => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/calendars/next-read/${parasha}`, { signal });
        if (r.status === 404) return null;
        const d = await apiJson<ApiNextRead>(r, `Next read ${parasha}`);
        if (!d?.date) return null;
        return { date: d.date, aliyot: d.parasha?.extraDetails?.aliyot ?? [], haftarot: (d.haftarah ?? []).map((h) => ({ url: h.url, en: h.displayValue.en, he: h.displayValue.he })) };
      },
    }),
    staleTime: 24 * 60 * 60_000,
    retry: false,
  });

export interface Portal {
  about?: { title: { en?: string; he?: string }; titleUrl?: string; imageUri?: string; imageCaption?: { en?: string; he?: string }; description?: { en?: string; he?: string } };
  mobile?: { title: { en?: string; he?: string }; description?: { en?: string; he?: string }; androidLink?: string; iosLink?: string };
  organization?: { title: { en?: string; he?: string }; description?: { en?: string; he?: string } };
  newsletter?: { title: { en?: string; he?: string }; description?: { en?: string; he?: string } };
}

interface ApiPortal {
  about?: { title: { en?: string; he?: string }; title_url?: string; image_uri?: string; image_caption?: { en?: string; he?: string }; description?: { en?: string; he?: string } };
  mobile?: { title: { en?: string; he?: string }; description?: { en?: string; he?: string }; android_link?: string; ios_link?: string };
  organization?: { title: { en?: string; he?: string }; description?: { en?: string; he?: string } };
  newsletter?: { title: { en?: string; he?: string }; description?: { en?: string; he?: string } };
}

/** Sefaria.getPortal: a partner's modules for the side column (TOP-027). */
export const portalQueryOptions = (slug: string) =>
  queryOptions<Portal>({
    ...withPolicy("catalog", {
      queryKey: ["topics", "portal", slug] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Portal> => {
        const p = await apiJson<ApiPortal>(await fetch(`${SEFARIA_API_ORIGIN}/api/portals/${encodeURIComponent(slug)}`, { signal }), `Portal ${slug}`);
        return {
          ...(p.about ? { about: { title: p.about.title, ...(p.about.title_url ? { titleUrl: p.about.title_url } : {}), ...(p.about.image_uri ? { imageUri: p.about.image_uri } : {}), ...(p.about.image_caption ? { imageCaption: p.about.image_caption } : {}), ...(p.about.description ? { description: p.about.description } : {}) } } : {}),
          ...(p.mobile ? { mobile: { title: p.mobile.title, ...(p.mobile.description ? { description: p.mobile.description } : {}), ...(p.mobile.android_link ? { androidLink: p.mobile.android_link } : {}), ...(p.mobile.ios_link ? { iosLink: p.mobile.ios_link } : {}) } } : {}),
          ...(p.organization ? { organization: p.organization } : {}),
          ...(p.newsletter ? { newsletter: p.newsletter } : {}),
        };
      },
    }),
  });

// --------------------------------------------------------------------------------------------------------------- the moderators

/** The raw "about" links (the moderators' writes send them back whole, as the old page did). Browser only, staff only. */
async function rawAboutLinks(slug: string): Promise<(ApiRefLink & Record<string, unknown>)[]> {
  const t = await apiJson<ApiTopic>(await fetch(`${SEFARIA_API_ORIGIN}${topicApiPath(slug, ["about", "popular-writing-of"])}`, { credentials: "include" }), `Topic ${slug}`);
  return (t.refs?.about?.refs ?? []) as (ApiRefLink & Record<string, unknown>)[];
}

/** generatePrompts: ask the server (Celery, an LLM) to write prompts for these links. Resolves with the refs asked for. */
export async function generatePrompts(slug: string, refs: readonly string[]): Promise<string[]> {
  const want = new Set(refs);
  const links = (await rawAboutLinks(slug)).filter((l) => want.has(l.ref)).map((l) => ({ ...l, toTopic: slug }));
  const res = await postJson(`/api/topics/generate-prompts/${slug}`, { ref_topic_links: links });
  if (!res.ok) throw new SefariaApiError(`Generate prompts: HTTP ${res.status}`, res.status);
  return links.map((l) => l.ref);
}

/** publishPrompts: mark these links' descriptions published in the interface language. Resolves with the published refs. */
export async function publishPrompts(slug: string, refs: readonly string[], lang: AzLang): Promise<string[]> {
  const want = new Set(refs);
  const links = (await rawAboutLinks(slug))
    .filter((l) => want.has(l.ref))
    .map((l) => ({ ...l, toTopic: slug, descriptions: { ...l.descriptions, [lang]: { ...l.descriptions?.[lang], published: true } } }));
  const res = await postJson(`/api/ref-topic-links/bulk`, links);
  if (!res.ok) throw new SefariaApiError(`Publish prompts: HTTP ${res.status}`, res.status);
  const data = res.data as unknown;
  return Array.isArray(data) ? (data as { anchorRef?: string }[]).map((d) => d.anchorRef ?? "") : links.map((l) => l.ref);
}

/** markReviewedPostRequest: one language's description of one link set to "reviewed" (`/api/ref-topic-links/<normRef>`). */
export async function markReviewed(slug: string, ref: string, lang: AzLang): Promise<void> {
  const link = (await rawAboutLinks(slug)).find((l) => l.ref === ref);
  const res = await postJson(`/api/ref-topic-links/${legacyNormRef(ref)}`, {
    topic: slug,
    is_new: false,
    new_ref: ref,
    interface_lang: lang === "en" ? "english" : "hebrew",
    description: { ...link?.descriptions?.[lang], review_state: "reviewed" },
  });
  if (!res.ok || typeof res.data.error === "string") throw new SefariaApiError(`Mark reviewed: ${String(res.data.error ?? `HTTP ${res.status}`)}`, res.status);
}
