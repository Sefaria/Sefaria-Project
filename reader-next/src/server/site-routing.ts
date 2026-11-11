/**
 * Which server answers a page request, and how (src/start.ts's request middleware, here so it can be tested with Django stubbed).
 *
 *  - `/healthz-reader`: this server's own probe.
 *  - On a Library host only (never on the Voices host — Voices is out of scope, its requests go on exactly as before this lane):
 *    the language-domain bounce (T-E07, language-domain.ts) and the old addresses that are only a redirect (T-F26, redirects.ts).
 *  - The trailing-slash redirect, the calendar shortcuts, and the hand-over to Django of every path this client does not render
 *    (pass-through.ts, route-manifest.ts, topics-owner.ts).
 *  - When Django has no page either (404), the reader's own 404 page, rendered at the same address (T-F28, lib/routing/not-found.ts);
 *    on the Voices host Django's 404 is passed on untouched.
 *
 * @feature RTE-040 404 and error pages
 * @feature RTE-059 Language-domain redirect
 */
import { asNotFound, FORCE_NOT_FOUND, replaceDjangoNotFound } from "~/lib/routing/not-found";
import { isLibraryOnlyPage, isVoicesHost } from "~/lib/routing/django-paths";
import { parseCookieHeader } from "~/lib/reader/settings";
import { hasSessionCookie } from "~/lib/auth/session";
import { calendarShortcut, voicesNotFound } from "./calendar-shortcuts";
import { fixedRedirect, randomLinkRedirect } from "./redirects";
import { languageDomainAnswer, languageRedirect, signedInBounce, withHostOnlyLangCookieExpired, type DomainModules } from "./language-domain";
import { interfaceCookieDomain } from "~/lib/shell/interface-language";
import { passesToDjango, passResetLink, requestHost, resetLinkUid, trailingSlashRedirect, upstreamUnavailable } from "./pass-through";
import type { RouteOwner } from "./route-manifest";

export interface RoutingDeps {
  passThroughEnabled: boolean;
  /** Hand the request to Django (through Varnish) as it came. */
  passThrough: (r: Request) => Promise<Response>;
  voicesOrigin?: string;
  domainModules: DomainModules | null;
  routeOwner: (pathname: string) => Promise<RouteOwner>;
  topicsOwner: (url: URL) => Promise<"django" | "unknown">;
  /** The API's fetch for the calendar shortcuts and /random/link (tests stub it). */
  fetcher?: typeof fetch;
}

/** The router: render this request (with `context`, e.g. the forced not-found flag); its response. */
export type Render = (ctx?: { context: Record<string, unknown> }) => Promise<Response>;

const VOICES_404_RE = /^\/(?:calendars|parashat-hashavua|todays-daf-yomi)(?:\/|$)/;

/** Django's Set-Cookie headers (a session touched, a CSRF token) carried onto the answer that replaces Django's 404. */
function withCookiesOf(res: Response, from: Response): Response {
  const cookies = from.headers.getSetCookie?.() ?? [];
  if (!cookies.length) return res;
  const headers = new Headers(res.headers);
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Is this Django answer to be replaced by the reader's 404 page? (Never on the Voices host.) */
const replaceable = (request: Request, pathname: string, res: Response, voices: boolean) => replaceDjangoNotFound(pathname, request.method, res, voices);

export async function siteRoute(request: Request, pathname: string, render: Render, deps: RoutingDeps): Promise<Response> {
  if (pathname === "/healthz-reader") return new Response("ok", { headers: { "content-type": "text/plain" } });
  const host = requestHost(request);
  const voices = isVoicesHost(host, deps.voicesOrigin);
  const read = request.method === "GET" || request.method === "HEAD";
  const pass = () => (deps.passThroughEnabled ? deps.passThrough(request) : Promise.resolve(upstreamUnavailable(request)));
  const toDjango = deps.passThroughEnabled && passesToDjango(request, pathname);
  const renderNotFound = () => render({ context: { [FORCE_NOT_FOUND]: true } });
  /** Django's answer, or — when Django has no page there either — the reader's own 404 page at the same address. */
  const djangoOrNotFound = async (): Promise<Response> => {
    const res = await deps.passThrough(request);
    if (!replaceable(request, pathname, res, voices)) return res;
    await res.body?.cancel().catch(() => undefined);
    return withCookiesOf(asNotFound(await renderNotFound()), res);
  };

  if (!voices) {
    const redirects = fixedRedirect(pathname, request.method) !== null || pathname === "/random/link";
    // sefaria.org <-> sefaria.org.il by interface language, before any page of ours (Django's own pages do it themselves)
    if (read && deps.domainModules && (!toDjango || redirects)) {
      const cookie = request.headers.get("cookie") ?? "";
      const answer = languageDomainAnswer(
        { url: new URL(request.url), method: request.method, host, cookies: parseCookieHeader(cookie), headers: request.headers, signedIn: hasSessionCookie(cookie) },
        deps.domainModules,
      );
      // a signed-in arrival with ?set-language-cookie is Django's (it saves the profile); its answer also expires a stale host-only
      // interfaceLang, as /interface/<lang> does
      if (answer === "django")
        return deps.passThroughEnabled ? withHostOnlyLangCookieExpired(await deps.passThrough(request), interfaceCookieDomain(host, deps.domainModules)) : render();
      if (answer instanceof Response) return answer;
      if (answer === "ask-django" && deps.passThroughEnabled) {
        const to = await signedInBounce(request, deps.passThrough);
        if (to) return languageRedirect(to);
      }
    }
    // old addresses that are only a redirect, answered here (T-F26)
    const fixed = fixedRedirect(pathname, request.method);
    if (fixed) return fixed;
    const random = await randomLinkRedirect(pathname, request.method, deps.fetcher);
    if (random === "fallback") return pass();
    if (random) return random;
  }
  const slash = trailingSlashRedirect(new URL(request.url), request.method, host);
  if (slash) return slash;
  // the Library-only pages (translations, calendars and their shortcuts, compare, topics) are this client's on the Library host only
  // (Voices: Django's, Q-E1)
  const voicesOnly = isLibraryOnlyPage(pathname) && voices;
  if (!voicesOnly) {
    const shortcut = await calendarShortcut(pathname, request.method, pass, deps.fetcher);
    if (shortcut) return shortcut;
  }
  // without Django to hand it to, the Voices host answers the calendars pages as live voices.sefaria.org does (404), not with the Library page
  if (voicesOnly && !deps.passThroughEnabled && VOICES_404_RE.test(pathname)) return voicesNotFound();
  if (!deps.passThroughEnabled) return render();
  if (voicesOnly || toDjango) return djangoOrNotFound();
  const resetUid = request.method === "GET" ? resetLinkUid(pathname) : null;
  if (resetUid) return passResetLink(request, resetUid, deps.passThrough);
  // not a page of this client nor a text: Django's, without rendering it first (R-36)
  // (the path as sent, still encoded: a title's escaped "/" must not split it)
  if (read && (await deps.routeOwner(new URL(request.url).pathname)) === "django") return djangoOrNotFound();
  // the topic editors (?editor=1) are still Django's, before the topic is fetched (TOP-036)
  if (read && (await deps.topicsOwner(new URL(request.url))) === "django") return deps.passThrough(request);
  const result = await render();
  if (result.status !== 404) return result;
  // this client has no page here: Django's, if it has one; else this client's own 404, as it was rendered (T-F28)
  const django = await deps.passThrough(request);
  if (!replaceable(request, pathname, django, voices)) {
    await result.body?.cancel().catch(() => undefined);
    return django;
  }
  await django.body?.cancel().catch(() => undefined);
  return withCookiesOf(asNotFound(result), django);
}
