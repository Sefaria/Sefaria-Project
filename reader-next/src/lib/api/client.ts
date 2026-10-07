/**
 * The single Sefaria API client used by the app.
 *
 * Wraps the vendored toolkit client (typed + response-validated). Its own in-memory response cache is
 * disabled: the library cache (TanStack Query + IndexedDB, see src/lib/cache) owns all caching.
 */
import { API_ORIGIN } from "~/lib/config";
import { createSefariaClient, type SefariaClient } from "@vendor/sefaria-toolkit/client/index";

/** The API origin for this side (internal Varnish on the server in the cluster, the public one in the browser): src/lib/config.ts. */
export const SEFARIA_API_ORIGIN: string = API_ORIGIN;

let client: SefariaClient | undefined;

/**
 * The site itself is down or starting (Varnish has no backend: 502/503/504) — not a broken contract. Said plainly, so the page
 * offers "Try again" with a message a reader understands instead of a validation report.
 */
const UNAVAILABLE = new Set([502, 503, 504]);
const unavailableAware: typeof fetch = async (input, init) => {
  // globalThis.fetch at call time: on the server it is the internal-origin fetch (src/server/internal-fetch.ts)
  const res = await globalThis.fetch(input, init);
  if (UNAVAILABLE.has(res.status)) {
    throw new SefariaApiError(`Sefaria is temporarily unavailable (HTTP ${res.status}). Please try again in a moment.`, res.status);
  }
  return res;
};

export function getSefariaClient(): SefariaClient {
  client ??= createSefariaClient({ baseUrl: SEFARIA_API_ORIGIN, cache: false, fetch: unavailableAware });
  return client;
}

/** Thrown when the API answers with an error payload or status for a request we need. */
export class SefariaApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "SefariaApiError";
  }
}

/** Unwrap a fields-style toolkit result or throw a {@link SefariaApiError}. */
export function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }, what: string): T {
  if (result.data === undefined) {
    const status = result.response?.status;
    const detail =
      result.error && typeof result.error === "object" && "error" in result.error
        ? String((result.error as { error: unknown }).error)
        : `HTTP ${status ?? "?"}`;
    throw new SefariaApiError(`${what}: ${detail}`, status, result.error);
  }
  const data = result.data as T & { error?: unknown };
  // Some Sefaria endpoints answer 200 with {"error": "..."}.
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new SefariaApiError(`${what}: ${data.error}`, result.response?.status, data);
  }
  return data;
}
