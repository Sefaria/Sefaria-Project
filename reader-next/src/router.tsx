import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { makeQueryClient } from "~/lib/cache/query-client";
import { isFullCatalogQuery } from "~/lib/library/catalog-slice";
import { routeTree } from "./routeTree.gen";
import { isReaderPath } from "./lib/reader/paths";
import { parseSearch, stringifySearch } from "./lib/reader/search-serializer";
import { RouteError } from "./features/shared/RouteError";
import { NotFoundPage } from "./features/routing/NotFoundPage";

export function getRouter() {
  const queryClient = makeQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Text pages manage their own scroll (useReadingScroll): the router must not move them — not even its
    // "scroll to top after rendering", which otherwise fires once after hydration and yanks a deep link
    // back to the top for a frame on phones. Every other page gets normal restoration and reset.
    scrollRestoration: ({ location }) => !isReaderPath(location.pathname),
    // on a wide screen a page scrolls inside <main> (under the fixed header), so that is what goes back to the top
    scrollToTopSelectors: ["#main"],
    // Library data is immutable-ish and cached by the library cache; route matches need not reload.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
    // an address no route matches: the reader's own 404 page (T-F28)
    defaultNotFoundComponent: NotFoundPage,
    // Old-site query strings (no JSON quoting; `+` literal): every existing link keeps working.
    parseSearch,
    stringifySearch,
    // The old site writes a comma in a title as itself ("/Mishneh_Torah,_Shabbat.1.1", "/Jastrow,_אור"), not as %2C.
    pathParamsAllowedCharacters: [",", ":", "@"],
    // A trailing slash is the server's to settle (src/server/pass-through.ts trailingSlashRedirect: a 308 for reader and library
    // addresses); what it lets through renders as written, as sefaria.org does: "/calendars/" is a page there (200, its canonical with
    // the slash), not a redirect, and the version-diff tool's address means something else with and without it (/compare/Genesis.1/ is
    // a ref, /compare/Genesis.1 a version: LEG-010). The router's default ("never") answered such a path with a 307 of its own.
    trailingSlash: "preserve",
  });
  // Dehydrates server-fetched queries into the page and hydrates them on the client (no refetch).
  // ...except the whole catalog (3.5 MB, CODE_REVIEW R-14): library pages carry their slice instead; others load it on the client
  setupRouterSsrQueryIntegration({ router, queryClient, dehydrateOptions: { shouldDehydrateQuery: (q) => !isFullCatalogQuery(q.queryKey) } });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
