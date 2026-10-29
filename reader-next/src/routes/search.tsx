import { createFileRoute } from "@tanstack/react-router";
import { SearchRoute } from "~/features/search/SearchRoute";
import { autocorrectQueryOptions, decideAutocorrect } from "~/lib/search/autocorrect";
import { entitySearchQueryOptions } from "~/lib/search/entity-search";
import { parseSearchParams, searchResultsQueryOptions, searchTreeQueryOptions, type SearchParams } from "~/lib/search/search-page";

const ENTITY_TYPES = ["book", "author", "topic"] as const;

/** /search?q=… — full-text and name search. */
export const Route = createFileRoute("/search")({
  validateSearch: (raw: Record<string, unknown>) => raw as Record<string, string>,
  loaderDeps: ({ search }) => ({ q: search.q, search_tab: search.search_tab, tvar: search.tvar, tsort: search.tsort, tpathFilters: search.tpathFilters, disable_autocorrect: search.disable_autocorrect }),
  loader: async ({ context, deps }) => {
    const p = parseSearchParams(deps as Record<string, unknown>);
    if (!p.q.trim()) return;
    const qc = context.queryClient;
    // what the first screen shows, in the page itself (the tree and the counts follow on the client)
    const prefetch = (s: SearchParams) =>
      Promise.all([
        p.tab === "sources" ? qc.fetchInfiniteQuery(searchResultsQueryOptions(s)).catch(() => undefined) : Promise.resolve(),
        qc.prefetchQuery(searchTreeQueryOptions(s)),
        ...ENTITY_TYPES.map((t) => qc.prefetchQuery(entitySearchQueryOptions(s.q, t))),
      ]);
    // the query as typed is counted in every tab while the autocorrect service is asked (SRC-111)
    const [suggestion, typedSources] = await Promise.all([
      p.disableAutocorrect ? Promise.resolve(undefined) : qc.fetchQuery(autocorrectQueryOptions(p.q)).catch(() => null),
      qc.fetchInfiniteQuery(searchResultsQueryOptions(p)).catch(() => null),
      prefetch(p),
    ]);
    if (!suggestion?.corrected_query) return;
    const page = typedSources?.pages[0];
    const decision = decideAutocorrect({ data: suggestion }, [
      page ? page.total + (page.dicta?.total ?? 0) : "error",
      ...ENTITY_TYPES.map((t) => qc.getQueryData(entitySearchQueryOptions(p.q, t).queryKey)?.total ?? "error"),
    ]);
    if (!decision.pending && decision.corrected) await prefetch({ ...p, q: decision.corrected });
  },
  head: ({ match }) => ({ meta: [{ title: `${(match.search as { q?: string }).q ?? "Search"} | Sefaria Search` }] }),
  component: SearchRoute,
});
