import { isCancelledError, QueryClient } from "@tanstack/react-query";
import { SefariaApiError } from "~/lib/api/client";
import { invalidateAfterEditorReturn } from "./invalidate";
import { setStaffFreshness } from "./policies";

/**
 * Retry a read once when that could help: never an answer that will not change ("no such text" 4xx — retrying every 404 added a
 * second to every bad link), never a contract mismatch, and never on the server, where a page render has a deadline and the request
 * middleware turns an upstream failure into a 503.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (typeof window === "undefined" || failureCount >= 1) return false;
  if (error instanceof SefariaApiError && error.status !== undefined) return error.status >= 500 || error.status === 408 || error.status === 429;
  if (error instanceof Error && /contract/i.test(error.name)) return false;
  return true;
}

/**
 * On the server a client lives for one request: a query's gcTime there only schedules a timer that holds the request's data (megabytes of
 * text) in memory for hours after the response went out. Infinity schedules none, and the client is collected with the request (TanStack's
 * own server default, which the per-class policies would otherwise override).
 */
export function makeQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        refetchOnWindowFocus: false,
        // Library data rarely changes; a reconnect should not storm the API.
        refetchOnReconnect: false,
      },
    },
  });
  // A fetch is cancelled when its last observer unmounts (a hidden Suspense boundary, a closed panel) and it read its AbortSignal; every
  // other caller awaiting the same fetch then rejects with CancelledError, a route loader included, which showed the error page.
  // Nothing here cancels a query on purpose, so a caller whose fetch was cancelled under it simply asks again, once.
  const fetchQuery = client.fetchQuery.bind(client);
  client.fetchQuery = (async (options: Parameters<typeof fetchQuery>[0]) => {
    try {
      return await fetchQuery(options);
    } catch (e) {
      if (!isCancelledError(e)) throw e;
      return fetchQuery(options);
    }
  }) as typeof fetchQuery;
  if (typeof window !== "undefined") {
    // Staff always revalidate text (D-7): known once the viewer query answers (server-rendered, or fetched), whichever comes first
    client.getQueryCache().subscribe((event) => {
      const q = event.query;
      if (q.queryKey[0] === "user" && q.queryKey[1] === "viewer" && (event.type === "updated" || event.type === "added")) {
        setStaffFreshness(!!(q.state.data as { isStaff?: boolean } | null | undefined)?.isStaff);
      }
    });
    // Back from a Django editor (`?next=`): forget on disk what it changed before anything is read from there
    invalidateAfterEditorReturn();
  }
  if (typeof window === "undefined") {
    const defaults = client.defaultQueryOptions.bind(client);
    client.defaultQueryOptions = ((options: Parameters<typeof defaults>[0]) => ({ ...defaults(options), gcTime: Infinity })) as typeof defaults;
  }
  return client;
}
