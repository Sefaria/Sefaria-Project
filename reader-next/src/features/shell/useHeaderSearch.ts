import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import { nameQueryOptions, outcomeOf, repairQuery, suggestionsFrom } from "~/lib/search/autocomplete";
import { refToUrl } from "~/lib/ref/url";
import { toRouterLocation } from "../shared/RouterLink";
import type { HeaderSearchProps } from "~/ui/SiteHeader/HeaderSearch";
import { libraryHref, useSiteHost } from "~/lib/routing/library-href";
import { searchBoxAnalytics, searchFlow } from "~/lib/analytics";

/**
 * The header search box's behaviour in the app: suggestions from the name API (cached), Enter resolving a typed citation,
 * book, category or topic, and everything else a full-text search at /search.
 *
 * @feature SRC-002 Header search submit logic
 * @feature SRC-011 Smart submit: ref, topic or search
 * @feature SRC-015 Navigate to suggestion (redirectToObject)
 * @feature SRC-016 Show search results panel
 */
export function useHeaderSearch(): Omit<HeaderSearchProps, "mobile"> {
  const qc = useQueryClient();
  const router = useRouter();
  const host = useSiteHost();
  return useMemo(() => {
    const go = (href: string) => {
      if (/^https?:/.test(href)) window.location.assign(href);
      else void router.navigate(toRouterLocation(href) as never);
    };
    const search = (q: string) => {
      // the search page's funnel starts with source "nav_bar" (the old showSearch)
      searchFlow.setNextFlowSource("nav_bar");
      go(`/search?q=${encodeURIComponent(q.trim())}&tab=text`);
    };
    return {
      getSuggestions: async (q) => suggestionsFrom(q, await qc.fetchQuery(nameQueryOptions(q)), host),
      onSearch: search,
      onChoose: (s) => s.url && go(s.url),
      onSmartSubmit: async (query) => {
        // a miscapitalised name, then one typed with the wrong quote mark, is repaired and asked again until nothing changes (the old
        // getQueryObj's recursion; bounded here)
        let q = query;
        let d = await qc.fetchQuery(nameQueryOptions(q));
        for (let i = 0; i < 5; i++) {
          const next = repairQuery(q, d);
          if (next === q) break;
          q = next;
          d = await qc.fetchQuery(nameQueryOptions(q));
        }
        const out = outcomeOf(q, d);
        if (out.kind === "ref") {
          searchBoxAnalytics.autolinkRef(q, out.ref, out.isBook);
          go(`/${refToUrl(out.ref)}`);
        } else if (out.kind === "topic") {
          searchBoxAnalytics.autolinkTopic(q);
          go(libraryHref(`/topics/${out.slug}`, host));
        } else if (out.kind === "category") {
          searchBoxAnalytics.autolinkObject(q, "TocCategory", out.key);
          go(`/texts/${(Array.isArray(out.key) ? out.key : [out.key]).map(encodeURIComponent).join("/")}`);
        } else {
          searchBoxAnalytics.search(q);
          search(q);
        }
      },
    };
  }, [qc, router, host]);
}
