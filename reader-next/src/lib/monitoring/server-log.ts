/**
 * Structured server logs for the reader's Node process (LAUNCH_PLAN T-D02, Node side): one JSON line per page request on stdout, the
 * shape Datadog's log pipeline parses without a custom grok rule (`status`, `duration` in nanoseconds, `http.*`, `network.*`). The
 * fields operations alert on: request id, path kind, status, duration, upstream status, pass-through flag.
 *
 * The request id is the incoming `X-Request-Id` (nginx / the load balancer) when it looks like one, else a new one; it is answered on
 * the response and should be forwarded to Django on every upstream call (internal fetch and pass-through), so a reader 5xx can be
 * joined with Django's own log line.
 *
 * The API (src/start.ts belongs to lane E; these are the two calls it makes):
 *
 *     const log = beginRequestLog(request);                          // first thing in the outermost request middleware
 *     return log.finish(response, { upstreamStatus, passThrough });  // on the way out (also sets X-Request-Id on the response)
 *
 * `withRequestId(headers, id)` adds the id to an upstream request's headers.
 *
 * Never logged: query strings, cookies, user ids, any header but the request id. The path is logged without its query and with its
 * secrets collapsed (redact-path.ts: password-reset tokens, allauth keys, profile slugs, e-mail addresses).
 *
 * @feature PLT-031 Health checks and operational endpoints (request logs)
 */
import { redactPath } from "./redact-path";
import { routeKind, type RouteKind } from "./route-kind";

export const REQUEST_ID_HEADER = "x-request-id";
/** An incoming id is trusted only in this shape (no header injection, bounded length). */
const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export interface RequestLogLine {
  /** ISO time the request finished. */
  timestamp: string;
  level: "info" | "warn" | "error";
  logger: "reader";
  message: string;
  request_id: string;
  http: { method: string; url_details: { path: string }; status_code: number; route_kind: RouteKind };
  /** Nanoseconds, Datadog's convention for `duration`. */
  duration: number;
  /** The status Django/Varnish answered the page's data or the pass-through with, when there was one call that decided the page. */
  upstream_status?: number;
  /** True when the request was handed to Django untouched (src/server/pass-through.ts). */
  pass_through: boolean;
  /** The page failed because the API did (the 503 of start.ts upstreamStatus). */
  upstream_failed?: boolean;
  release: string | null;
}

export interface FinishInfo {
  upstreamStatus?: number;
  passThrough?: boolean;
  upstreamFailed?: boolean;
}

type Sink = (line: string) => void;
let sink: Sink = (line) => process.stdout.write(`${line}\n`);
/** Tests capture lines here. */
export const setLogSink = (s: Sink | null) => {
  sink = s ?? ((line) => process.stdout.write(`${line}\n`));
};

const hooks: ((line: RequestLogLine) => void)[] = [];
/** Something else that wants every line (a metrics counter): returns the remover. */
export function onRequestLogged(fn: (line: RequestLogLine) => void): () => void {
  hooks.push(fn);
  return () => {
    const i = hooks.indexOf(fn);
    if (i >= 0) hooks.splice(i, 1);
  };
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** The request's id: the incoming X-Request-Id when well-formed, else a fresh one. */
export function requestIdOf(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER)?.trim();
  return incoming && VALID_ID.test(incoming) ? incoming : newId();
}

/** Upstream request headers with the id added (keeps whatever else is there). */
export function withRequestId(headers: HeadersInit | undefined, id: string): Headers {
  const h = new Headers(headers);
  h.set(REQUEST_ID_HEADER, id);
  return h;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export interface RequestLog {
  id: string;
  /** Write the line and return the response with X-Request-Id set (a new Response only when the headers are immutable). */
  finish(response: Response, info?: FinishInfo): Response;
}

export function beginRequestLog(request: Request, release: string | null = (typeof process !== "undefined" ? process.env.APP_VERSION : undefined) ?? null): RequestLog {
  const started = now();
  const id = requestIdOf(request.headers);
  const rawPath = new URL(request.url).pathname;
  const path = redactPath(rawPath);
  return {
    id,
    finish(response, info = {}) {
      const status = response.status;
      const line: RequestLogLine = {
        timestamp: new Date().toISOString(),
        level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
        logger: "reader",
        message: `${request.method} ${path} ${status}`,
        request_id: id,
        http: { method: request.method, url_details: { path }, status_code: status, route_kind: routeKind(rawPath) },
        duration: Math.round((now() - started) * 1e6),
        ...(info.upstreamStatus !== undefined ? { upstream_status: info.upstreamStatus } : {}),
        pass_through: !!info.passThrough || response.headers.get("x-served-by") === "django",
        ...(info.upstreamFailed ? { upstream_failed: true } : {}),
        release,
      };
      try {
        sink(JSON.stringify(line));
        for (const h of hooks) h(line);
      } catch {
        /* logging never fails a request */
      }
      try {
        response.headers.set("X-Request-Id", id);
        return response;
      } catch {
        // a fetched (pass-through) response's headers are immutable
        const headers = new Headers(response.headers);
        headers.set("X-Request-Id", id);
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
    },
  };
}
