import { createMiddleware, createStart } from "@tanstack/react-start";
import { serverConfigProblems } from "~/lib/config";
import { pageCacheHeaders } from "./server/cache-policy";
import { routeOwner, warmRouteManifest } from "./server/route-manifest";
import { installInternalApiFetch, withUpstreamHealth } from "./server/internal-fetch";
import { isDjangoPath, passResetLink, passThrough, passThroughEnabled, resetLinkUid, trailingSlashRedirect, upstreamUnavailable } from "./server/pass-through";

// A misconfigured server fails at start, loudly, instead of answering every request with a broken page (CODE_REVIEW R-35)
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

/** `/healthz` for the cluster's probes, and the hand-over to Django of every page this client does not render. */
const siteRouting = createMiddleware({ type: "request" }).server(async ({ request, pathname, next }) => {
  if (pathname === "/healthz-reader") return new Response("ok", { headers: { "content-type": "text/plain" } });
  const slash = trailingSlashRedirect(new URL(request.url), request.method);
  if (slash) return slash;
  if (!passThroughEnabled()) return next();
  if (isDjangoPath(pathname, request.method)) return passThrough(request);
  const resetUid = request.method === "GET" ? resetLinkUid(pathname) : null;
  if (resetUid) return passResetLink(request, resetUid);
  // not a page of this client nor a text: Django's, without rendering it first (R-36)
  // (the path as sent, still encoded: a title's escaped "/" must not split it)
  if ((request.method === "GET" || request.method === "HEAD") && (await routeOwner(new URL(request.url).pathname)) === "django") return passThrough(request);
  const result = await next();
  return result.response.status === 404 ? passThrough(request) : result;
});

/**
 * A page that failed because the API did (a timeout, a network error, a 5xx) answers 503 with Retry-After — the truth for crawlers
 * and the signal a proxy can fall back on — instead of the 500 that means a bug here (CODE_REVIEW R-05).
 */
const upstreamStatus = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const health = { failed: false };
  const result = await withUpstreamHealth(health, () => next());
  const own = result.response.headers.get("x-served-by") !== "django"; // Django's own error pages pass through untouched
  if (!(own && result.response.status >= 500 && result.response.status !== 503 && health.failed)) return result;
  // logged, so a real bug that happened alongside an upstream failure is still seen in the server logs
  console.error(`[reader] ${new URL(request.url).pathname}: ${result.response.status} after an upstream failure, answered 503`);
  return upstreamUnavailable();
});

/** Every page's cache headers (src/server/cache-policy.ts). */
const cachePolicy = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const result = await next();
  const res = result.response;
  const headers = pageCacheHeaders(request.headers.get("cookie"), res.headers, res.status);
  return headers === res.headers ? result : new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});

export const startInstance = createStart(() => ({ requestMiddleware: [cachePolicy, upstreamStatus, siteRouting] }));
