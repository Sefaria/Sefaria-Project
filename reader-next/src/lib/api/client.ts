/**
 * The single Sefaria API client used by the app.
 *
 * Wraps the vendored toolkit client (typed + response-validated). Its own in-memory response cache is
 * disabled: the library cache (TanStack Query + IndexedDB, see src/lib/cache) owns all caching.
 */
import { API_ORIGIN } from "~/lib/config";
import { createSefariaClient, type SefariaClient } from "@vendor/sefaria-toolkit/client/runtime";

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
  // Responses are checked against the API's contracts in development and tests, where a drift should fail loudly; production skips
  // the check (~58 KB gzip of zod validators off every page, and no second parse of multi-MB responses on the main thread:
  // CODE_REVIEW R-10, R-15)
  client ??= createSefariaClient({ baseUrl: SEFARIA_API_ORIGIN, cache: false, fetch: unavailableAware, validate: Boolean(import.meta.env?.DEV) });
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

/**
 * Read a direct `fetch` of the Sefaria API through the same error model as the toolkit client ({@link unwrap}): a non-2xx answer, a
 * body that is not JSON (a proxy's HTML error page) and a 200 `{"error": "..."}` all throw {@link SefariaApiError}, so retry and
 * 404 decisions see them the same way (CODE_REVIEW low: these calls bypassed it).
 */
export async function apiJson<T>(r: Response, what: string): Promise<T> {
  if (!r.ok) throw new SefariaApiError(`${what}: HTTP ${r.status}`, r.status);
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    throw new SefariaApiError(`${what}: not JSON`, r.status);
  }
  if (data && typeof data === "object" && !Array.isArray(data) && typeof (data as { error?: unknown }).error === "string") {
    throw new SefariaApiError(`${what}: ${(data as { error: string }).error}`, r.status, data);
  }
  return data as T;
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
