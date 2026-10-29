/**
 * Search auto-correction, as master's search.js `decideAutocorrect` (#3724, sc-47189): `GET /api/search-autocorrect?q=` answers
 * `{corrected_query, suggested_queries}` (at most one set). Suggestions are shown as "Did you mean"; a confident correction is applied
 * only when the query as typed finds nothing in any tab (Sources, Books, Authors, Topics). A count that failed, or is not a number,
 * means no correction; so does an endpoint that failed.
 *
 * @feature SRC-111 Search auto-correction and suggestions
 */
import { queryOptions } from "@tanstack/react-query";
import { apiJson, SEFARIA_API_ORIGIN } from "~/lib/api/client";
import { POLICIES } from "~/lib/cache/policies";

export interface AutocorrectSuggestion {
  corrected_query: string | null;
  suggested_queries: string[] | null;
}

export const autocorrectQueryOptions = (q: string) =>
  queryOptions({
    queryKey: ["search", "autocorrect", q] as const,
    queryFn: async ({ signal }): Promise<AutocorrectSuggestion> => {
      const r = await fetch(`${SEFARIA_API_ORIGIN}/api/search-autocorrect?q=${encodeURIComponent(q)}`, { signal });
      const d = await apiJson<Partial<AutocorrectSuggestion>>(r, `Autocorrect "${q}"`);
      return { corrected_query: d.corrected_query || null, suggested_queries: d.suggested_queries?.length ? d.suggested_queries : null };
    },
    staleTime: POLICIES.search.staleTime,
    gcTime: POLICIES.search.gcTime,
    retry: false,
  });

/** What to search and what to suggest; `pending` until it can be decided (the suggestion or a needed count has not come). */
export type AutocorrectDecision = { pending: true } | { pending: false; corrected: string | null; suggested: string[] | null };

export const NO_AUTOCORRECT: AutocorrectDecision = { pending: false, corrected: null, suggested: null };

/** A tab's count of the query as typed: a number, `undefined` while loading, or `"error"`. */
export type TabCount = number | undefined | "error";

export function decideAutocorrect(
  suggestion: { data?: AutocorrectSuggestion; error?: boolean },
  typedCounts: readonly TabCount[],
): AutocorrectDecision {
  if (suggestion.error) return NO_AUTOCORRECT;
  if (!suggestion.data) return { pending: true };
  const { corrected_query, suggested_queries } = suggestion.data;
  if (!corrected_query) return { pending: false, corrected: null, suggested: suggested_queries };
  // master's _allEmpty: any results → as typed; a failed or non-numeric count (before any results) → as typed; all zero → correct
  if (typedCounts.some((c) => typeof c === "number" && c > 0)) return NO_AUTOCORRECT;
  if (typedCounts.some((c) => c === "error" || (c !== undefined && !Number.isFinite(c)))) return NO_AUTOCORRECT;
  if (typedCounts.some((c) => c === undefined)) return { pending: true };
  return { pending: false, corrected: corrected_query, suggested: null };
}
