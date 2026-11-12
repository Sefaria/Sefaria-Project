import { createMiddleware, createStart } from "@tanstack/react-start";
import { PUBLIC_CONFIG, serverConfigProblems } from "~/lib/config";
import { pageCacheHeaders } from "./server/cache-policy";
import { routeOwner, warmRouteManifest } from "./server/route-manifest";
import { installInternalApiFetch, withUpstreamHealth } from "./server/internal-fetch";
import { topicsOwner } from "./server/topics-owner";
import { domainLang, domainModulesFromEnv } from "./server/language-domain";
import { siteRoute, type RoutingDeps } from "./server/site-routing";
import { passThrough, passThroughEnabled, requestHost, upstreamUnavailable } from "./server/pass-through";
import { beginRequestLog } from "~/lib/monitoring/server-log";

// A misconfigured server fails at start, loudly, instead of answering every request with a broken page
if (typeof window === "undefined" && typeof process !== "undefined") {
  const problems = serverConfigProblems(process.env);
  if (problems.length) {
    const message = `[reader] configuration: ${problems.join("; ")}`;
    if (process.env.NODE_ENV === "production") throw new Error(message);
    console.warn(message);
  }
}

installInternalApiFetch();
// the route manifest's catalog, loaded at start rather than by the first requests (they do not wait for it meanwhile)
if (typeof window === "undefined" && passThroughEnabled()) void warmRouteManifest();

const ROUTING_DEPS: RoutingDeps = {
  passThroughEnabled: passThroughEnabled(),
  passThrough,
  voicesOrigin: PUBLIC_CONFIG.voicesOrigin,
  domainModules: domainModulesFromEnv(),
  routeOwner,
  topicsOwner,
};

/** `/healthz` for the cluster's probes, and the hand-over to Django of every page this client does not render (src/server/site-routing.ts). */
const siteRouting = createMiddleware({ type: "request" }).server(async ({ request, pathname, next }) => siteRoute(request, pathname, async (ctx) => (await next(ctx)).response, ROUTING_DEPS));

/**
 * A page that failed because the API did (a timeout, a network error, a 5xx) answers 503 with Retry-After — the truth for crawlers
 * and the signal a proxy can fall back on — instead of the 500 that means a bug here.
 */
const upstreamStatus = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const health = { failed: false };
  const result = await withUpstreamHealth(health, () => next());
  const own = result.response.headers.get("x-served-by") !== "django"; // Django's own error pages pass through untouched
  if (!(own && result.response.status >= 500 && result.response.status !== 503 && health.failed)) return result;
  // logged, so a real bug that happened alongside an upstream failure is still seen in the server logs
  console.error(`[reader] ${new URL(request.url).pathname}: ${result.response.status} after an upstream failure, answered 503`);
  return upstreamUnavailable(request);
});

/**
 * One structured log line per request, with its X-Request-Id answered (src/lib/monitoring/server-log.ts): the
 * outermost middleware, so it records the status the reader actually got. The cluster's health probes are not logged (one every few
 * seconds per pod, nothing to learn from them).
 */
const requestLog = createMiddleware({ type: "request" }).server(async ({ request, pathname, next }) => {
  if (pathname.startsWith("/healthz")) return next();
  const log = beginRequestLog(request);
  try {
    const result = await next();
    return log.finish(result.response);
  } catch (err) {
    log.finish(new Response(null, { status: 500 }));
    throw err;
  }
});

/** Every page's cache headers (src/server/cache-policy.ts). */
const cachePolicy = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const result = await next();
  const res = result.response;
  // Accept-Language decides the page only on a host pinned to a language (the bounce)
  const pinned = !!domainLang(requestHost(request), ROUTING_DEPS.domainModules);
  const headers = pageCacheHeaders(request.headers.get("cookie"), res.headers, res.status, pinned);
  return headers === res.headers ? result : new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});

export const startInstance = createStart(() => ({ requestMiddleware: [requestLog, cachePolicy, upstreamStatus, siteRouting] }));
