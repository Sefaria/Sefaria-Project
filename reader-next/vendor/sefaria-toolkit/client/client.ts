import {
  createClient,
  type Config,
  type RequestOptions,
  type RequestResult,
} from "@hey-api/client-fetch";

import {
  createSefariaResponseCache,
  type SefariaCacheOptions,
} from "./response-cache.js";
import { validateResponse } from "./validation.js";

export type { SefariaCacheOptions } from "./response-cache.js";

/** Configuration used to create an isolated Sefaria API client. */
export interface SefariaClientOptions {
  /** API origin. Defaults to `https://www.sefaria.org`. */
  readonly baseUrl?: string;
  /** Fetch implementation used for requests, testing, or host integration. */
  readonly fetch?: typeof fetch;
  /** Bounded per-client response caching. Enabled with defaults when omitted. */
  readonly cache?: false | SefariaCacheOptions;
}

const sefariaClientBrand: unique symbol = Symbol("SefariaClient");
const sefariaClients = new WeakSet<object>();

type SefariaGetOptions<ThrowOnError extends boolean> = Omit<
  RequestOptions<"fields", ThrowOnError>,
  "method" | "responseStyle"
> & {
  readonly responseStyle?: "fields";
};

type SefariaPostOptions<ThrowOnError extends boolean> = Omit<
  RequestOptions<"fields", ThrowOnError>,
  "method" | "responseStyle"
> & {
  readonly responseStyle?: "fields";
};

/** Branded client accepted by the generated Sefaria SDK operations. */
export interface SefariaClient {
  /** Compile-time brand preventing accidental structural substitutes. */
  readonly [sefariaClientBrand]: true;
  /** Removes all responses retained by this client. */
  readonly clearCache: () => void;
  /**
   * Performs a validated GET request using fields-style responses.
   *
   * A fields-style result exposes the response payload on `data`, a documented
   * error payload on `error`, and the original Fetch `Response` metadata on
   * `response`.
   *
   * Documented HTTP error statuses resolve as typed error payloads. Contract
   * mismatches reject with `SefariaContractError`; network failures and aborts
   * reject with the original error.
   */
  readonly get: <
    TData = unknown,
    TError = unknown,
    ThrowOnError extends boolean = false,
  >(
    options: SefariaGetOptions<ThrowOnError>,
  ) => RequestResult<TData, TError, ThrowOnError, "fields">;
  /**
   * Performs a validated POST request using fields-style responses.
   *
   * A fields-style result exposes the response payload on `data`, a documented
   * error payload on `error`, and the original Fetch `Response` metadata on
   * `response`.
   *
   * Documented HTTP error statuses resolve as typed error payloads. Contract
   * mismatches reject with `SefariaContractError`; network failures and aborts
   * reject with the original error.
   */
  readonly post: <
    TData = unknown,
    TError = unknown,
    ThrowOnError extends boolean = false,
  >(
    options: SefariaPostOptions<ThrowOnError>,
  ) => RequestResult<TData, TError, ThrowOnError, "fields">;
}

/**
 * Creates a frozen generated-SDK client with status-aware response validation.
 *
 * Documented HTTP error statuses resolve through the generated typed error
 * payloads. A response that violates the generated contract rejects with
 * `SefariaContractError`. Fetch network failures and aborts reject with the
 * original error.
 */
export function createSefariaClient(
  options: SefariaClientOptions = {},
): SefariaClient {
  const fetchImplementation: typeof fetch = (input, init) =>
    (options.fetch ?? globalThis.fetch)(input, init);
  const responseCache =
    options.cache === false
      ? undefined
      : createSefariaResponseCache(fetchImplementation, options.cache);
  const config: Config = {
    baseUrl: options.baseUrl ?? "https://www.sefaria.org",
    ...(responseCache !== undefined
      ? { fetch: responseCache.fetch }
      : options.fetch !== undefined
        ? { fetch: options.fetch }
        : {}),
  };

  const client = createClient(config);
  client.interceptors.response.use(
    async (response, request, requestOptions) => {
      await validateResponse({
        method: request.method,
        path: requestOptions.url,
        response,
      });
      await responseCache?.admit(response, request, requestOptions.url);
      return response;
    },
  );
  client.interceptors.error.use((error, response) => {
    if (error instanceof Error || response === undefined) {
      throw error;
    }
    return error;
  });
  const facade: SefariaClient = {
    [sefariaClientBrand]: true,
    clearCache: () => responseCache?.clear(),
    get: client.get,
    post: client.post,
  };
  sefariaClients.add(facade);
  return Object.freeze(facade);
}

/** Rejects clients that were not created by {@link createSefariaClient}. */
export function requireSefariaClient(client: SefariaClient): SefariaClient {
  if (!sefariaClients.has(client)) {
    throw new TypeError(
      "Generated Sefaria SDK functions require createSefariaClient().",
    );
  }
  return client;
}
