import { pageUrls, searchMeta } from "~/lib/library/page-head";
import type { QueryClient } from "@tanstack/react-query";
import { CANONICAL_ORIGIN } from "~/lib/config";
import { hebrewSiteOrigin } from "~/lib/routing/site-origins";
import { pageCanonicalOrigin } from "~/lib/routing/canonical";
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
    const origin = await pageCanonicalOrigin();
    await loadSearch(context.queryClient, deps as Record<string, unknown>);
    return { origin };
  },
  // reader/views.py search's description and noindex (PLT-007, RTE-029); the title the old client sets; og:url and the alternates as
  // base.html (no canonical: search sets no canonical_url)
  head: ({ match, loaderData }) => {
    const search = match.search as Record<string, string>;
    const qs = new URLSearchParams(Object.entries(search).filter(([, v]) => typeof v === "string")).toString();
    const urls = loaderData ? pageUrls(`${match.pathname}${qs ? `?${qs}` : ""}`, loaderData.origin, { canonical: false, english: CANONICAL_ORIGIN, hebrew: hebrewSiteOrigin(CANONICAL_ORIGIN) }) : { meta: [], links: [] };
    return { meta: [...searchMeta(search.q, (match.context as { interfaceLang?: "english" | "hebrew" }).interfaceLang ?? "english"), ...urls.meta], links: urls.links };
  },
  component: SearchRoute,
});

async function loadSearch(qc: QueryClient, deps: Record<string, unknown>): Promise<void> {
    const p = parseSearchParams(deps);
    if (!p.q.trim()) return;
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
}
