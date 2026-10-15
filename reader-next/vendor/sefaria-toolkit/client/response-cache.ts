import { LRUCache } from "lru-cache";

import { getResponseContract } from "./validation.js";

/** Default time that an admitted response remains reusable. */
export const DEFAULT_SEFARIA_CACHE_TTL_MS = 5 * 60 * 1_000;
/** Default maximum number of admitted responses per client. */
export const DEFAULT_SEFARIA_CACHE_MAX_ENTRIES = 100;
/** Default maximum decoded response-body bytes retained per client. */
export const DEFAULT_SEFARIA_CACHE_MAX_BYTES = 10 * 1024 * 1024;

/** Limits for one client's bounded in-memory response cache. */
export interface SefariaCacheOptions {
  /** Positive finite time-to-live in milliseconds for an admitted response. Defaults to five minutes. */
  readonly ttlMs?: number;
  /** Positive integer maximum number of admitted responses retained by one client. Defaults to 100. */
  readonly maxEntries?: number;
  /** Positive integer maximum decoded response-body bytes retained by one client. Defaults to 10 MiB. */
  readonly maxBytes?: number;
}

interface CachedResponse {
  readonly body: Uint8Array;
  readonly headers: [string, string][];
  readonly redirected: boolean;
  readonly size: number;
  readonly status: number;
  readonly statusText: string;
  readonly type: ResponseType;
  readonly url: string;
}

const DYNAMIC_OPERATION_PATHS = new Set([
  "/api/async/{task_id}",
  "/api/sheets/modified/{sheet_id}/{timestamp}",
  "/api/texts/random",
  "/api/texts/random-by-topic",
]);

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function cacheKey(request: Request): string {
  const headers = [...request.headers.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify({
    method: request.method,
    url: request.url,
    headers,
    cache: request.cache,
    credentials: request.credentials,
    integrity: request.integrity,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
  });
}

function replayResponse(entry: CachedResponse): Response {
  const response = new Response(new Blob([entry.body.slice()]), {
    headers: entry.headers,
    status: entry.status,
    statusText: entry.statusText,
  });
  Object.defineProperties(response, {
    redirected: { configurable: true, value: entry.redirected },
    type: { configurable: true, value: entry.type },
    url: { configurable: true, value: entry.url },
  });
  return response;
}

function canCarryCredentials(request: Request): boolean {
  if (
    request.headers.has("authorization") ||
    request.headers.has("cookie") ||
    request.credentials === "include"
  ) {
    return true;
  }
  if (
    request.credentials !== "same-origin" ||
    typeof location === "undefined"
  ) {
    return false;
  }
  return new URL(request.url).origin === location.origin;
}

function isEligibleRequest(request: Request): boolean {
  return (
    request.method === "GET" &&
    request.cache === "default" &&
    !canCarryCredentials(request) &&
    !request.headers.has("range") &&
    !request.headers.has("if-match") &&
    !request.headers.has("if-modified-since") &&
    !request.headers.has("if-none-match") &&
    !request.headers.has("if-unmodified-since")
  );
}

function responseTtl(response: Response, configuredTtl: number): number | null {
  const cacheControl = response.headers.get("cache-control")?.toLowerCase();
  if (
    cacheControl
      ?.split(",")
      .some((directive) =>
        ["no-store", "no-cache", "private", "must-revalidate"].includes(
          directive.trim().split("=", 1)[0] ?? "",
        ),
      ) ||
    response.headers.get("vary")?.trim() === "*"
  ) {
    return null;
  }

  const maxAgeDirective = cacheControl
    ?.split(",")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("max-age="));
  if (maxAgeDirective === undefined) {
    return configuredTtl;
  }
  const maxAge = maxAgeDirective.slice("max-age=".length);
  const age = response.headers.get("age");
  if (!/^\d+$/.test(maxAge) || (age !== null && !/^\d+$/.test(age))) {
    return null;
  }
  const maxAgeSeconds = Number(maxAge);
  const ageSeconds = Number(age ?? "0");
  if (!Number.isFinite(maxAgeSeconds) || !Number.isFinite(ageSeconds)) {
    return null;
  }
  const remainingMilliseconds = Math.max(0, maxAgeSeconds - ageSeconds) * 1_000;
  return Math.min(configuredTtl, remainingMilliseconds);
}

function isNegativePayload(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (("error" in value && typeof value.error === "string") ||
      ("is_ref" in value && value.is_ref === false))
  );
}

/** Internal validated-response cache used by one generated client instance. */
export interface SefariaResponseCache {
  /** Fetch implementation that serves eligible completed hits. */
  readonly fetch: typeof fetch;
  /** Admits one validated generated-operation response when eligible. */
  readonly admit: (
    response: Response,
    request: Request,
    operationPath: string,
  ) => Promise<void>;
  /** Removes every retained response and invalidates pending admissions. */
  readonly clear: () => void;
}

/** Creates one isolated bounded response cache around a Fetch implementation. */
export function createSefariaResponseCache(
  fetchImplementation: typeof fetch,
  options: SefariaCacheOptions = {},
): SefariaResponseCache {
  const ttl = positiveFinite(
    options.ttlMs ?? DEFAULT_SEFARIA_CACHE_TTL_MS,
    "cache.ttlMs",
  );
  const max = positiveInteger(
    options.maxEntries ?? DEFAULT_SEFARIA_CACHE_MAX_ENTRIES,
    "cache.maxEntries",
  );
  const maxSize = positiveInteger(
    options.maxBytes ?? DEFAULT_SEFARIA_CACHE_MAX_BYTES,
    "cache.maxBytes",
  );
  const entries = new LRUCache<string, CachedResponse>({
    ttl,
    max,
    maxSize,
    updateAgeOnGet: false,
    allowStale: false,
    sizeCalculation: (entry) => entry.size,
  });
  const requestGenerations = new WeakMap<Request, number>();
  const hits = new WeakSet<Response>();
  let generation = 0;

  const cachedFetch: typeof fetch = async (input, init) => {
    const request =
      input instanceof Request && init === undefined
        ? input
        : new Request(input, init);
    requestGenerations.set(request, generation);
    if (request.signal.aborted) {
      throw request.signal.reason;
    }
    if (isEligibleRequest(request)) {
      const cached = entries.get(cacheKey(request));
      if (cached !== undefined) {
        const response = replayResponse(cached);
        hits.add(response);
        return response;
      }
    }
    return await fetchImplementation(request);
  };

  return {
    fetch: cachedFetch,
    admit: async (response, request, operationPath) => {
      if (
        hits.has(response) ||
        requestGenerations.get(request) !== generation ||
        DYNAMIC_OPERATION_PATHS.has(operationPath) ||
        !isEligibleRequest(request) ||
        response.status !== 200 ||
        !response.ok
      ) {
        return;
      }
      const effectiveTtl = responseTtl(response, ttl);
      if (
        effectiveTtl === null ||
        !Number.isFinite(effectiveTtl) ||
        effectiveTtl <= 0
      ) {
        return;
      }

      const body = new Uint8Array(await response.clone().arrayBuffer());
      if (body.byteLength > maxSize) {
        return;
      }
      const contract = getResponseContract({
        method: request.method,
        path: operationPath,
        status: response.status,
      });
      if (contract === undefined) {
        return;
      }
      if (contract.bodyType === "json") {
        const value = JSON.parse(new TextDecoder().decode(body)) as unknown;
        if (isNegativePayload(value)) {
          return;
        }
      }
      if (requestGenerations.get(request) !== generation) {
        return;
      }
      entries.set(
        cacheKey(request),
        {
          body,
          headers: [...response.headers.entries()],
          redirected: response.redirected,
          size: Math.max(1, body.byteLength),
          status: response.status,
          statusText: response.statusText,
          type: response.type,
          url: response.url,
        },
        { ttl: effectiveTtl },
      );
    },
    clear: () => {
      generation += 1;
      entries.clear();
    },
  };
}
