import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { makeQueryClient } from "~/lib/cache/query-client";
import { routeTree } from "./routeTree.gen";
import { isReaderPath } from "./lib/reader/paths";
import { parseSearch, stringifySearch } from "./lib/reader/search-serializer";
import { RouteError } from "./features/shared/RouteError";

export function getRouter() {
  const queryClient = makeQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    // Text pages manage their own scroll (useReadingScroll): the router must not move them — not even its
    // "scroll to top after rendering", which otherwise fires once after hydration and yanks a deep link
    // back to the top for a frame on phones. Every other page gets normal restoration and reset.
    scrollRestoration: ({ location }) => !isReaderPath(location.pathname),
    // Library data is immutable-ish and cached by the library cache; route matches need not reload.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: RouteError,
    // Old-site query strings (no JSON quoting; `+` literal): every existing link keeps working.
    parseSearch,
    stringifySearch,
    // The old site writes a comma in a title as itself ("/Mishneh_Torah,_Shabbat.1.1", "/Jastrow,_אור"), not as %2C.
    pathParamsAllowedCharacters: [",", ":", "@"],
  });
  // Dehydrates server-fetched queries into the page and hydrates them on the client (no refetch).
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
