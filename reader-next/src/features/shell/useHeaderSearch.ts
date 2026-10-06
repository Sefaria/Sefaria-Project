import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import { nameQueryOptions, outcomeOf, repairGershayimVariant, suggestionsFrom } from "~/lib/search/autocomplete";
import { refToUrl } from "~/lib/ref/url";
import { toRouterLocation } from "../shared/RouterLink";
import type { HeaderSearchProps } from "~/ui/SiteHeader/HeaderSearch";
import { SITE_ORIGIN } from "~/lib/config";

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
  return useMemo(() => {
    const go = (href: string) => {
      if (/^https?:/.test(href)) window.location.assign(href);
      else void router.navigate(toRouterLocation(href) as never);
    };
    const search = (q: string) => go(`/search?q=${encodeURIComponent(q.trim())}&tab=text`);
    return {
      getSuggestions: async (q) => suggestionsFrom(q, await qc.fetchQuery(nameQueryOptions(q))),
      onSearch: search,
      onChoose: (s) => s.url && go(s.url),
      onSmartSubmit: async (query) => {
        // a name typed with the wrong quote mark is repaired before it is judged
        let q = query;
        let d = await qc.fetchQuery(nameQueryOptions(q));
        const repaired = repairGershayimVariant(q, d);
        if (repaired !== q) {
          q = repaired;
          d = await qc.fetchQuery(nameQueryOptions(q));
        }
        const out = outcomeOf(q, d);
        if (out.kind === "ref") go(`/${refToUrl(out.ref)}`);
        else if (out.kind === "topic") go(`${SITE_ORIGIN}/topics/${out.slug}`);
        else if (out.kind === "category") go(`/texts/${(Array.isArray(out.key) ? out.key : [out.key]).map(encodeURIComponent).join("/")}`);
        else search(q);
      },
    };
  }, [qc, router]);
}
