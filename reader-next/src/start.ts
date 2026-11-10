import { createMiddleware, createStart } from "@tanstack/react-start";
import { PUBLIC_CONFIG, serverConfigProblems } from "~/lib/config";
import { pageCacheHeaders } from "./server/cache-policy";
import { routeOwner, warmRouteManifest } from "./server/route-manifest";
import { installInternalApiFetch, withUpstreamHealth } from "./server/internal-fetch";
import { calendarShortcut, voicesNotFound } from "./server/calendar-shortcuts";
import { topicsOwner } from "./server/topics-owner";
import { fixedRedirect, randomLinkRedirect } from "./server/redirects";
import { domainModulesFromEnv, languageDomainAnswer, languageRedirect, signedInBounce } from "./server/language-domain";
import { asNotFound, FORCE_NOT_FOUND, replaceDjangoNotFound } from "~/lib/routing/not-found";
import { parseCookieHeader } from "~/lib/reader/settings";
import { hasSessionCookie } from "~/lib/auth/session";
import { isLibraryOnlyPage, isVoicesHost } from "~/lib/routing/django-paths";
import { passesToDjango, passResetLink, passThrough, passThroughEnabled, requestHost, resetLinkUid, trailingSlashRedirect, upstreamUnavailable } from "./server/pass-through";

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

const VOICES_404_RE = /^\/(?:calendars|parashat-hashavua|todays-daf-yomi)(?:\/|$)/;

/** Django's answer, or — when Django has no page there either (404) — the reader's own 404 page, rendered at the same address (T-F28). */
async function djangoOrNotFound(request: Request, pathname: string, renderNotFound: () => Promise<Response>): Promise<Response> {
  const res = await passThrough(request);
  if (!replaceDjangoNotFound(pathname, request.method, res, isVoicesHost(requestHost(request), PUBLIC_CONFIG.voicesOrigin))) return res;
  await res.body?.cancel().catch(() => undefined);
  return asNotFound(await renderNotFound());
}

/** The language-domain bounce for a page this server answers (T-E07, src/server/language-domain.ts): a redirect, Django, or nothing. */
async function languageAnswer(request: Request): Promise<Response | "django" | null> {
  const modules = domainModulesFromEnv();
  if (!modules) return null;
  const cookie = request.headers.get("cookie") ?? "";
  const answer = languageDomainAnswer(
    { url: new URL(request.url), method: request.method, host: requestHost(request), cookies: parseCookieHeader(cookie), headers: request.headers, signedIn: hasSessionCookie(cookie) },
    modules,
  );
  if (answer !== "ask-django") return answer;
  if (!passThroughEnabled()) return null;
  const to = await signedInBounce(request, passThrough);
  return to ? languageRedirect(to) : null;
}

/** `/healthz` for the cluster's probes, and the hand-over to Django of every page this client does not render. */
const siteRouting = createMiddleware({ type: "request" }).server(async ({ request, pathname, next }) => {
  if (pathname === "/healthz-reader") return new Response("ok", { headers: { "content-type": "text/plain" } });
  const read = request.method === "GET" || request.method === "HEAD";
  const toDjango = passThroughEnabled() && passesToDjango(request, pathname);
  // the router renders this address as the reader's 404 page (the root route throws notFound: src/lib/routing/not-found.ts)
  const renderNotFound = async () => (await next({ context: { [FORCE_NOT_FOUND]: true } })).response;
  // sefaria.org <-> sefaria.org.il by interface language, before any page of ours (Django's own pages do it themselves)
  if (read && !(toDjango && !fixedRedirect(pathname, request.method) && pathname !== "/random/link")) {
    const lang = await languageAnswer(request);
    if (lang === "django") return passThrough(request);
    if (lang) return lang;
  }
  // old addresses that are only a redirect, answered here (T-F26, src/server/redirects.ts)
  const fixed = fixedRedirect(pathname, request.method);
  if (fixed) return fixed;
  const random = await randomLinkRedirect(pathname, request.method);
  if (random === "fallback") return passThroughEnabled() ? passThrough(request) : upstreamUnavailable(request);
  if (random) return random;
  const slash = trailingSlashRedirect(new URL(request.url), request.method, requestHost(request));
  if (slash) return slash;
  // the Library-only pages (translations, calendars and their shortcuts, compare, topics) are this client's on the Library host only
  // (Voices: Django's, Q-E1)
  const voicesOnly = isLibraryOnlyPage(pathname) && isVoicesHost(requestHost(request), PUBLIC_CONFIG.voicesOrigin);
  if (!voicesOnly) {
    const shortcut = await calendarShortcut(pathname, request.method, () => (passThroughEnabled() ? passThrough(request) : upstreamUnavailable(request)));
    if (shortcut) return shortcut;
  }
  // without Django to hand it to, the Voices host answers the calendars pages as live voices.sefaria.org does (404), not with the Library page
  if (voicesOnly && !passThroughEnabled() && VOICES_404_RE.test(pathname)) return voicesNotFound();
  if (!passThroughEnabled()) return next();
  if (voicesOnly || toDjango) return djangoOrNotFound(request, pathname, renderNotFound);
  const resetUid = request.method === "GET" ? resetLinkUid(pathname) : null;
  if (resetUid) return passResetLink(request, resetUid);
  // not a page of this client nor a text: Django's, without rendering it first (R-36)
  // (the path as sent, still encoded: a title's escaped "/" must not split it)
  if (read && (await routeOwner(new URL(request.url).pathname)) === "django") return djangoOrNotFound(request, pathname, renderNotFound);
  // the topic editors (?editor=1) are still Django's, before the topic is fetched (TOP-036)
  if (read && (await topicsOwner(new URL(request.url))) === "django") return passThrough(request);
  const result = await next();
  if (result.response.status !== 404) return result;
  // this client has no page here: Django's, if it has one; else this client's own 404, as it was rendered (T-F28)
  const django = await passThrough(request);
  if (!replaceDjangoNotFound(pathname, request.method, django, isVoicesHost(requestHost(request), PUBLIC_CONFIG.voicesOrigin))) {
    await result.response.body?.cancel().catch(() => undefined);
    return django;
  }
  await django.body?.cancel().catch(() => undefined);
  return asNotFound(result.response);
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
  return upstreamUnavailable(request);
});

/** Every page's cache headers (src/server/cache-policy.ts). */
const cachePolicy = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const result = await next();
  const res = result.response;
  const headers = pageCacheHeaders(request.headers.get("cookie"), res.headers, res.status);
  return headers === res.headers ? result : new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});

export const startInstance = createStart(() => ({ requestMiddleware: [cachePolicy, upstreamStatus, siteRouting] }));
