import { QueryClient } from "@tanstack/react-query";
import { SefariaApiError } from "~/lib/api/client";

/**
 * Retry a read once when that could help: never an answer that will not change ("no such text" 4xx — retrying every 404 added a
 * second to every bad link), never a contract mismatch, and never on the server, where a page render has a deadline and the request
 * middleware turns an upstream failure into a 503 (CODE_REVIEW R-17).
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
  if (typeof window === "undefined") {
    const defaults = client.defaultQueryOptions.bind(client);
    client.defaultQueryOptions = ((options: Parameters<typeof defaults>[0]) => ({ ...defaults(options), gcTime: Infinity })) as typeof defaults;
  }
  return client;
}
