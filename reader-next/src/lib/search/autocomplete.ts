/**
 * The header search box's brain: what to suggest while typing, and what Enter does. A port of the old HeaderAutocomplete
 * and Sefaria.getName / repairCaseVariant / repairGershayimVariant, on the same `GET /api/name/<text>` call.
 * VERIFIED on sefaria.org: "gen" → Topics (Gender, Genesis …) and Books (Genesis, Gen. R.), "rashi on gen" → Authors, Topics,
 * Categories, Books; suggestions start at three characters.
 *
 * @feature SRC-001 Header search suggestions
 * @feature SRC-002 Header search submit logic
 * @feature SRC-003 Typeahead suggestions in header
 * @feature SRC-004 Minimum 3 characters for suggestions
 * @feature SRC-006 Suggestion destination URLs
 * @feature SRC-007 Suggestion grouping, headers and icons
 * @feature SRC-009 'Search for' row
 * @feature SRC-011 Smart submit: ref, topic or search
 * @feature SRC-012 Case and gershayim query repair
 * @feature SRC-031 Name completion API
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { refToUrl } from "~/lib/ref/url";
import { SITE_ORIGIN } from "~/lib/config";

export const MIN_SUGGEST_LENGTH = 3;
/** What the Library's box suggests (the Voices box has its own list). */
export const LIBRARY_TYPES = ["Topic", "ref", "TocCategory", "Term"] as const;

export interface Completion {
  title: string;
  key: string | string[];
  type: string;
  is_primary?: boolean;
  order?: number;
  topic_pools?: string[];
}
export interface NameResponse {
  is_ref?: boolean;
  is_book?: boolean;
  ref?: string;
  url?: string;
  type?: string;
  key?: string | string[];
  topic_slug?: string;
  completions?: string[];
  completion_objects?: Completion[];
}

export const nameQueryOptions = (text: string, types: readonly string[] = LIBRARY_TYPES, topicPool = "library") => {
  const t = text.trim();
  const params = new URLSearchParams();
  for (const ty of types) params.append("type", ty);
  params.append("topic_pool", topicPool);
  return queryOptions<NameResponse>({
    ...withPolicy("reference", {
      queryKey: ["name", t, [...types], topicPool] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<NameResponse> => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/name/${encodeURIComponent(t)}?${params}`, { signal });
        if (!r.ok) throw new SefariaApiError(`Name ${t}: HTTP ${r.status}`, r.status);
        return (await r.json()) as NameResponse;
      },
    }),
    staleTime: 10 * 60 * 1000,
  });
};

export type SuggestionType = "search" | "ref" | "Collection" | "TocCategory" | "Topic" | "AuthorTopic" | "User" | "Term";
export interface Suggestion {
  type: SuggestionType;
  label: string;
  /** Where choosing it goes; absent for the "Search for" row. */
  url?: string;
  key?: string | string[];
}

/** The heading over each group. */
export const GROUP_TITLES: Record<SuggestionType, { en: string; he: string }> = {
  search: { en: "", he: "" },
  ref: { en: "Books", he: "ספרים" },
  Collection: { en: "Collections", he: "אסופות" },
  TocCategory: { en: "Categories", he: "קטגוריות" },
  Topic: { en: "Topics", he: "נושאים" },
  AuthorTopic: { en: "Authors", he: "מחברים" },
  User: { en: "Users", he: "משתמשים" },
  Term: { en: "Terms", he: "מונחים" },
};

/** The group order the old code ends up with (its comparator is reversed: SRC-008): Terms, Users, Authors, Topics, Categories, Collections, Books. */
const TYPE_ORDER = ["search", "ref", "Collection", "TocCategory", "Topic", "PersonTopic", "AuthorTopic", "User", "Term"];
const rank = (t: string) => TYPE_ORDER.indexOf(t);

/** Where a suggestion leads in the Library (topic pages are the library's until this client has its own). */
export function urlForObject(type: string, key: string | string[]): string | undefined {
  if (type === "TocCategory") return `/texts/${(Array.isArray(key) ? key : [key]).map(encodeURIComponent).join("/")}`;
  if (type === "Topic" || type === "PersonTopic" || type === "AuthorTopic") return `${SITE_ORIGIN}/topics/${key as string}`;
  if (type === "ref") return `/${refToUrl(key as string)}`;
  return undefined; // Collections and Users belong to Voices
}

/** The "Search for" row first, then the completions grouped by type, groups in the old order. Nothing for no completions. */
export function suggestionsFrom(query: string, d: NameResponse): Suggestion[] {
  const comps = (d.completion_objects ?? [])
    .map((o) => ({ ...o, type: (o.type === "PersonTopic" ? "Topic" : o.type) as SuggestionType, url: urlForObject(o.type, o.key) }))
    .filter((o) => o.url !== undefined);
  if (!comps.length) return [];
  // stable sort by descending rank, as the old comparator did
  const sorted = comps.map((c, i) => ({ c, i })).sort((a, b) => rank(b.c.type) - rank(a.c.type) || a.i - b.i).map((x) => x.c);
  const groups = new Map<string, Suggestion[]>();
  for (const c of sorted) {
    const g = groups.get(c.type) ?? [];
    g.push({ type: c.type, label: c.title, url: c.url, key: c.key });
    groups.set(c.type, g);
  }
  return [{ type: "search", label: query }, ...[...groups.values()].flat()];
}

// (A miscapitalised citation — "genesis 1" — is repaired by the API itself: it answers is_ref with the canonical ref.)

/** Hebrew abbreviations typed with ״ (gershayim) match the stored ". */
export function repairGershayimVariant(query: string, d: NameResponse): string {
  if (!d.is_ref && d.completions && !d.completions.includes(query)) {
    const norm = (s: string) => s.replace("״", '"');
    const hit = d.completions.find((c) => norm(c) === norm(query));
    if (hit) return hit;
  }
  return query;
}

/** What pressing Enter on a typed query does. */
export type QueryOutcome =
  | { kind: "ref"; ref: string; isBook: boolean }
  | { kind: "topic"; slug: string }
  | { kind: "category"; key: string | string[] }
  | { kind: "search"; query: string };

export function outcomeOf(query: string, d: NameResponse): QueryOutcome {
  if (d.is_ref && d.ref) return { kind: "ref", ref: d.ref, isBook: !!d.is_book };
  if (d.topic_slug) return { kind: "topic", slug: d.topic_slug };
  if (d.type === "TocCategory" && d.key) return { kind: "category", key: d.key };
  return { kind: "search", query };
}
