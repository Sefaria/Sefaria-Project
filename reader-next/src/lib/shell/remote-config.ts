import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, apiJson } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

/** Every active remote-config entry (GET /api/remote-config), the switches the old server put in the page props. */
export const remoteConfigQueryOptions = () =>
  queryOptions<Record<string, unknown>>({
    ...withPolicy("search", {
      queryKey: ["remote-config"] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => apiJson<Record<string, unknown>>(await fetch(`${SEFARIA_API_ORIGIN}/api/remote-config`, { signal }), "Remote config"),
    }),
    staleTime: 10 * 60 * 1000,
  });
