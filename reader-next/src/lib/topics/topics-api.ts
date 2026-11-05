/**
 * The topics adapter: every topic endpoint the topics pages read, as query options, plus the newsletter write. The URLs are the old
 * client's, byte for byte (static/js/sefaria/sefaria.js getTopicsByPool, getTrendingLibraryTopics, getFeaturedTopic, getUpcomingDay,
 * topicList, getTopic, getName, subscribeSefariaNewsletter), so Varnish and the analytics see the same requests.
 *
 * Classes: the random pool samples are never cached (the old getTopicsByPool cached only a non-random order); trending, the
 * featured topic and the calendar topics are the day's (the old cache key was the date: memory, a day); a single topic is
 * catalog data.
 *
 * @feature TOP-004 Topic search with autocomplete
 * @feature TOP-005 Topic word cloud (salad)
 * @feature TOP-006 Featured topic of the day
 * @feature TOP-007 Topics newsletter sign-up
 * @feature TOP-008 Random topic cards with descriptions
 * @feature TOP-009 This week's Torah portion card
 * @feature TOP-010 Seasonal Jewish calendar topic card
 * @feature TOP-015 Topic page data loading
 * @feature TOP-031 Topic pool and trending endpoints
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, apiJson } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { postJson } from "~/lib/auth/http";
import type { AzLang, Bilingual, TopicListItem, TopicSummary } from "./topic-model";

const DAY_MS = 24 * 60 * 60_000;
const get = async <T>(path: string, what: string, signal?: AbortSignal) => apiJson<T>(await fetch(`${SEFARIA_API_ORIGIN}${path}`, { signal }), what);

/** `GET /api/topics/pools/<pool>?n=<n>` — a random sample each time (not cached, as the old client). */
export const topicPoolQueryOptions = (pool: string, n: number) =>
  queryOptions<TopicSummary[]>({
    queryKey: ["topics", "pool", pool, n] as const,
    queryFn: ({ signal }) => get<TopicSummary[]>(`/api/topics/pools/${encodeURIComponent(pool)}?n=${n}`, `Topic pool ${pool}`, signal),
    staleTime: Infinity, // one sample per page visit: a refocus must not reshuffle the cloud under the reader
    gcTime: 0,
    retry: false,
  });

/** `GET /api/topics/trending?n=10&pool=general_<lang>` (the Library's trending topics; the day's). */
export const trendingTopicsQueryOptions = (lang: AzLang, n = 10) =>
  queryOptions<TopicSummary[]>({
    ...withPolicy("search", {
      queryKey: ["topics", "trending", lang, n] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => get<TopicSummary[]>(`/api/topics/trending?n=${n}&pool=general_${lang}`, "Trending topics", signal),
    }),
    staleTime: DAY_MS,
  });

export interface FeaturedTopic extends TopicSummary {
  secondary_image_uri?: string;
  image?: { image_uri?: string; image_caption?: Bilingual };
}

/** `GET /_api/topics/featured-topic?lang=<lang>` — the topic of the day, or null when there is none (the old page hid the block). */
export const featuredTopicQueryOptions = (lang: AzLang) =>
  queryOptions<FeaturedTopic | null>({
    ...withPolicy("search", {
      queryKey: ["topics", "featured", lang] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/_api/topics/featured-topic?lang=${lang}`, { signal });
        if (r.status === 404) return null;
        return (await apiJson<{ topic: FeaturedTopic }>(r, "Featured topic")).topic ?? null;
      },
    }),
    staleTime: DAY_MS,
    retry: false,
  });

export interface ParashaDay {
  title: Bilingual;
  displayValue: Bilingual;
  url: string;
  ref: string;
  heRef?: string;
  description?: { en?: string; he?: string };
  /** The portion's topic slug (parasha_data_api include_topic_slug). */
  topic?: string;
}

export interface SeasonalDay {
  topic?: TopicSummary;
  secondary_topic?: TopicSummary | null;
  display_start_date?: string | null;
  display_end_date?: string | null;
  display_date_prefix?: string | null;
  display_date_suffix?: string | null;
}

/** `GET /api/calendars/topics/<parasha|holiday>?lang=<lang>` (Sefaria.getUpcomingDay). Null when the server has none (404). */
export function upcomingDayQueryOptions(day: "parasha", lang: AzLang): ReturnType<typeof upcoming<ParashaDay>>;
export function upcomingDayQueryOptions(day: "holiday", lang: AzLang): ReturnType<typeof upcoming<SeasonalDay>>;
export function upcomingDayQueryOptions(day: "parasha" | "holiday", lang: AzLang): ReturnType<typeof upcoming<ParashaDay>> | ReturnType<typeof upcoming<SeasonalDay>> {
  return day === "parasha" ? upcoming<ParashaDay>(day, lang) : upcoming<SeasonalDay>(day, lang);
}
function upcoming<T>(day: "parasha" | "holiday", lang: AzLang) {
  return queryOptions<T | null>({
    ...withPolicy("search", {
      queryKey: ["topics", "upcoming", day, lang] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/calendars/topics/${day}?lang=${lang}`, { signal });
        if (r.status === 404) return null;
        return apiJson<T>(r, `Upcoming ${day}`);
      },
    }),
    staleTime: DAY_MS,
    retry: false,
  });
}

/**
 * `GET /api/topics?limit=0` — every topic the A–Z filter searches (2.9 MB; the server answers Cache-Control max-age=3600). Fetched
 * in the browser only when a filter is typed; the letter pages come from the server (toc-source azSliceQueryOptions).
 */
export const topicListQueryOptions = () =>
  queryOptions<TopicListItem[]>({
    queryKey: ["topics", "list"] as const,
    queryFn: ({ signal }) => get<TopicListItem[]>(`/api/topics?limit=0`, "Topic list", signal),
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
  });

/**
 * One topic as the topic pages load it (Sefaria.getTopic → `GET /api/v2/topics/<slug>?…`, the same parameters, so the next page,
 * the single topic page, can build on it). The category page reads it for the moderators' editor and its title.
 */
export const topicQueryOptions = (slug: string) =>
  queryOptions<TopicSummary & Record<string, unknown>>({
    ...withPolicy("catalog", {
      queryKey: ["topics", "topic", slug] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        get<TopicSummary & Record<string, unknown>>(
          `/api/v2/topics/${encodeURIComponent(slug)}?annotate_time_period=1&ref_link_type_filters=about|popular-writing-of&with_html=0&with_links=1&annotate_links=1&with_refs=1&group_related=1&with_indexes=1`,
          `Topic ${slug}`,
          signal,
        ),
    }),
  });

export interface NameCompletion {
  key: string;
  title: string;
  type?: string;
}

/** The landing search's lookup: `GET /api/name/<word>?limit=20&type=Topic&topic_pool=library&exact_continuations=1&order_by_matched_length=1`. */
export const topicNameQueryOptions = (word: string) => {
  const w = word.trim();
  return queryOptions<NameCompletion[]>({
    ...withPolicy("search", {
      queryKey: ["topics", "name", w] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (await get<{ completion_objects?: NameCompletion[] }>(`/api/name/${encodeURIComponent(w)}?limit=20&type=Topic&topic_pool=library&exact_continuations=1&order_by_matched_length=1`, `Name ${w}`, signal)).completion_objects ?? [],
    }),
    staleTime: 10 * 60_000,
  });
};

/** Sefaria.getTopicLandingNewsletterMailingLists: the English interface signs up to the weekly topics list; Hebrew to none. */
export const topicNewsletterLists = (lang: AzLang): string[] => (lang === "en" ? ["Weekly Topics Newsletter"] : []);

/**
 * Sefaria.subscribeSefariaNewsletter: `POST /api/subscribe/<email>` with `{language, educator, firstName, lastName, lists?}` (lists
 * left out when empty). Resolves on success; rejects with the message the old page showed (empty: the generic apology).
 */
export async function subscribeTopicsNewsletter(firstName: string, lastName: string, email: string, lang: AzLang): Promise<void> {
  const lists = topicNewsletterLists(lang);
  const res = await postJson(`/api/subscribe/${email}`, { language: lang, educator: false, firstName, lastName, ...(lists.length ? { lists } : {}) });
  // the old apiRequestWithBody: a failed status is "Error posting to API", a 200 {error} is its message
  if (res.networkError) throw new Error("");
  if (!res.ok) throw new Error("Error posting to API");
  if (typeof res.data.error === "string") throw new Error(res.data.error);
}
