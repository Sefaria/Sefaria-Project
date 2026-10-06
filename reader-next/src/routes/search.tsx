import { createFileRoute } from "@tanstack/react-router";
import { SearchRoute } from "~/features/search/SearchRoute";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { entitySearchQueryOptions } from "~/lib/search/entity-search";
import { parseSearchParams, searchResultsQueryOptions, searchTreeQueryOptions } from "~/lib/search/search-page";

/** /search?q=… — full-text and name search. */
export const Route = createFileRoute("/search")({
  validateSearch: (raw: Record<string, unknown>) => raw as Record<string, string>,
  loaderDeps: ({ search }) => ({ q: search.q, search_tab: search.search_tab, tvar: search.tvar, tsort: search.tsort, tpathFilters: search.tpathFilters }),
  loader: async ({ context, deps }) => {
    const p = parseSearchParams(deps as Record<string, unknown>);
    if (!p.q.trim()) return;
    const qc = context.queryClient;
    // what the first screen shows, in the page itself (the tree and the counts follow on the client)
    await Promise.all([
      qc.ensureQueryData(tocQueryOptions()),
      p.tab === "sources" ? qc.fetchInfiniteQuery(searchResultsQueryOptions(p)).catch(() => undefined) : Promise.resolve(),
      qc.prefetchQuery(searchTreeQueryOptions(p)),
      ...(["book", "author", "topic"] as const).map((t) => qc.prefetchQuery(entitySearchQueryOptions(p.q, t))),
    ]);
  },
  head: ({ match }) => ({ meta: [{ title: `${(match.search as { q?: string }).q ?? "Search"} | Sefaria Search` }] }),
  component: SearchRoute,
});
