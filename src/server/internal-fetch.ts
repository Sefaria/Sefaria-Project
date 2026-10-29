/**
 * In the cluster the server reaches the API through the Varnish service (SEFARIA_API_ORIGIN, e.g. http://varnish-<env>:8040). Django
 * picks the site from the Host header, so every server-side request to that origin must carry the site's host (SEFARIA_API_HOST, or the
 * host the browser asked for when a page is passed through) and say it came over https, as nginx would.
 *
 * Node's fetch silently drops a Host header, so requests to the internal origin go through node:http instead (same signature, a
 * standard Response back). Browser code is untouched. Installed on every server (not only in the cluster) for the read deadline.
 */
import type { IncomingMessage } from "node:http";
import type { AsyncLocalStorage } from "node:async_hooks";

/**
 * Every server-side read has a deadline (CODE_REVIEW R-05): a hung API used to hold the page render open until nginx gave up (300 s).
 * GET/HEAD get SEFARIA_API_TIMEOUT_MS (default 8 s), combined with any signal of their own; writes are never cut short.
 */
export const API_TIMEOUT_MS = Number((typeof process !== "undefined" && process.env.SEFARIA_API_TIMEOUT_MS) || 8000);

/**
 * Per page request: did any upstream read fail (timeout, network, 5xx)? The request middleware then answers 503, not 500.
 * node:async_hooks is loaded lazily, on the server only: this module is also part of the client bundle (through src/start.ts), and a
 * top-level import of a Node built-in there stops the page from hydrating.
 */
export interface UpstreamHealth {
  failed: boolean;
}
let health: AsyncLocalStorage<UpstreamHealth> | undefined;
export async function withUpstreamHealth<T>(store: UpstreamHealth, fn: () => T | Promise<T>): Promise<T> {
  if (!health) {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    health ??= new AsyncLocalStorage<UpstreamHealth>();
  }
  return health.run(store, async () => fn());
}
const markFailed = () => {
  const s = health?.getStore();
  if (s) s.failed = true;
};

/** A caller that needs a different read deadline (the pass-through to Django's pages) says so; fetch ignores the extra key. */
export type DeadlineInit = RequestInit & { deadlineMs?: number };

export function installInternalApiFetch() {
  if (typeof window !== "undefined" || typeof process === "undefined") return;
  const origin = process.env.SEFARIA_API_ORIGIN;
  const host = process.env.SEFARIA_API_HOST;
  const g = globalThis as { __sefariaFetchPatched?: boolean };
  if (g.__sefariaFetchPatched) return;
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "GET" || method === "HEAD") {
      // the deadline always applies, also when the caller passes its own signal (the query client always does: a signal that only
      // fires on cancellation never fires for a hung upstream, which is how a render hung for 60 s+ even with a deadline in place)
      const own = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const deadline = AbortSignal.timeout((init as DeadlineInit | undefined)?.deadlineMs ?? API_TIMEOUT_MS);
      init = { ...init, signal: own ? AbortSignal.any([own, deadline]) : deadline };
    }
    try {
      const res = await route(input, init);
      if (res.status >= 500) markFailed();
      return res;
    } catch (e) {
      markFailed();
      throw e;
    }
  };
  g.__sefariaFetchPatched = true;

  async function route(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // only a plain-http internal origin (the Varnish service) needs the Host rewrite; an https origin is a public host already
    if (!origin || !host || !url.startsWith(origin) || !origin.startsWith("http:")) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("host", headers.get("x-forwarded-host") ?? host);
    if (!headers.has("x-forwarded-proto")) headers.set("x-forwarded-proto", "https");
    if (!headers.has("x-forwarded-port")) headers.set("x-forwarded-port", "443");
    return httpFetch(url, { ...init, method: init?.method ?? (input instanceof Request ? input.method : "GET"), headers });
  }
}

async function httpFetch(url: string, init: RequestInit): Promise<Response> {
  const { request } = url.startsWith("https:") ? await import("node:https") : await import("node:http");
  const { Readable } = await import("node:stream");
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => (headers[k] = v));
  headers["accept-encoding"] = "identity"; // an internal hop: plain bodies, so JSON parses and passed-through pages need no re-encoding
  const body = init.body == null ? undefined : typeof init.body === "string" ? init.body : init.body instanceof ReadableStream ? Readable.fromWeb(init.body as never) : String(init.body);
  return new Promise<Response>((resolve, reject) => {
    const req = request(url, { method: init.method, headers, signal: init.signal ?? undefined }, (res: IncomingMessage) => {
      const out = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
        else out.set(k, v);
      }
      const status = res.statusCode ?? 502;
      const noBody = init.method === "HEAD" || status === 204 || status === 304;
      resolve(new Response(noBody ? null : (Readable.toWeb(res) as ReadableStream), { status, statusText: res.statusMessage, headers: out }));
    });
    req.on("error", reject);
    if (body === undefined) req.end();
    else if (typeof body === "string") req.end(body);
    else body.pipe(req);
  });
}
