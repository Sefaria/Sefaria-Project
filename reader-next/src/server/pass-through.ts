/**
 * The site's pages this client does not render (topics, sheets, profiles, login, admin, static pages…) are still Django's. In the
 * cluster every page request reaches this server first (nginx sends `/` here); what is not ours is passed on to Varnish, which answers
 * from its cache or asks Django. Two rules:
 *  - paths that are always Django's (and every non-GET request) go straight through, without rendering anything;
 *  - anything else is rendered here, and if this client has no page for it (404) Django gets the request instead — so a page we have
 *    not heard of (a new static page, a redirect) still works.
 * Off unless SEFARIA_PASS_THROUGH=1 (local development shows this client's own 404).
 */
import { API_ORIGIN } from "~/lib/config";
import type { DeadlineInit } from "./internal-fetch";

/*
 * Not here (rendered by this client since the auth port): "login", "register" and "password" (the reset link). Every POST to them —
 * the /register JSON sign-up, the reset link's JSON set-password/resend — still goes to Django by the "every write" rule below.
 */
/** First path segments that are always Django's (sefaria/urls*.py, plus the pages the old site serves under them). */
export const DJANGO_PREFIXES = [
  "api", "_api", "static", "admin", "logout", "account", "accounts", "_allauth", "gauth", "unlink-gauth", "sso",
  "topics", "sheets", "sheets-with-ref", "collections", "groups", "profile", "people", "person", "settings", "calendars", "notifications", "saved",
  "history", "my", "community", "activity", "dashboard", "explore", "garden", "vgarden", "visualize", "translations", "translate", "contributors",
  "download", "data", "linker", "linker-editor", "modtools", "random", "parashat-hashavua", "todays-daf-yomi", "torahtracker", "compare", "edit",
  "add", "new-home", "getstarted", "healthz", "healthz-rollout", "health-check", "sefaria.js", "search-autocomplete-redirecter", "embed", "edit_text",
];
const PREFIX_RE = new RegExp(`^/(?:${DJANGO_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[/.]|$)`);

export const passThroughEnabled = () => typeof process !== "undefined" && process.env.SEFARIA_PASS_THROUGH === "1";

/** This client's own server functions (TanStack Start's default base): never Django's, whatever the method. */
const SERVER_FN_RE = /^\/_serverFn\//;

/** Always Django's, whatever this client could render (every write, except to this client's own server functions). */
export const isDjangoPath = (pathname: string, method: string) =>
  !SERVER_FN_RE.test(pathname) && ((method !== "GET" && method !== "HEAD") || PREFIX_RE.test(pathname));

const PASS_THROUGH_TIMEOUT_MS = Number((typeof process !== "undefined" && process.env.SEFARIA_PASS_THROUGH_TIMEOUT_MS) || 30000);

/** What a page answers when what it needs upstream is down or too slow: 503 (try again), never a 500 (a bug) or a hang. */
export const upstreamUnavailable = () =>
  new Response("The library is not answering right now. Please try again in a moment.", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "5", "cache-control": "no-store" },
  });

const HOP_BY_HOP = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];

/** Forward the request to Varnish as it came (method, headers, cookies, body; the original Host), and hand back Django's answer as it is. */
export async function passThrough(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set("x-forwarded-host", url.host);
  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  // a read gets a deadline (Django pages can be slow, so longer than the API's); a write is never cut short (CODE_REVIEW R-05)
  if (request.method === "GET" || request.method === "HEAD") (init as DeadlineInit).deadlineMs = PASS_THROUGH_TIMEOUT_MS;
  let res: Response;
  try {
    res = await fetch(`${API_ORIGIN}${url.pathname}${url.search}`, init);
  } catch {
    return upstreamUnavailable();
  }
  const out = new Headers(res.headers);
  // fetch has already decoded the body: the length and encoding no longer describe it
  out.delete("content-encoding");
  out.delete("content-length");
  for (const h of HOP_BY_HOP) out.delete(h);
  out.set("x-served-by", "django");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

/**
 * The reset link from the email, /password/reset/confirm/<uidb64>/<token>/, must be seen by Django first: its
 * PasswordResetConfirmView checks the token, stores it in the session and redirects to …/<uidb64>/set-password/ — which this
 * client renders (asking Django whether the stored token is still good: AuthPage's probe). For an invalid token Django answers with
 * its own page instead of a redirect; then we send the reader to the set-password address anyway, where the probe finds the link
 * invalid and shows the "link expired" card (whose resend works: Django resolves the account from the uid).
 */
const RESET_LINK_RE = /^\/password\/reset\/confirm\/([^/]+)\/([^/]+)\/?$/;
export const SET_PASSWORD_TOKEN = "set-password"; // Django's PasswordResetConfirmView.reset_url_token

/** The uid of a reset link that still carries its token (not yet the set-password address), else null. */
export function resetLinkUid(pathname: string): string | null {
  const m = RESET_LINK_RE.exec(pathname);
  return m && m[2] !== SET_PASSWORD_TOKEN ? m[1]! : null;
}

export const setPasswordPath = (uid: string) => `/password/reset/confirm/${uid}/${SET_PASSWORD_TOKEN}/`;

/** Hand the token link to Django; keep its redirect, or turn its "invalid link" page into a redirect to the set-password address. */
export async function passResetLink(request: Request, uid: string, pass: (r: Request) => Promise<Response> = passThrough): Promise<Response> {
  const res = await pass(request);
  // a redirect is Django's answer as it is; a failure (5xx, our 503) is passed on, not turned into "the link expired"
  if ((res.status >= 300 && res.status < 400) || res.status >= 500) return res;
  const headers = new Headers({ location: setPasswordPath(uid), "x-served-by": "django" });
  for (const c of res.headers.getSetCookie?.() ?? []) headers.append("set-cookie", c);
  await res.body?.cancel().catch(() => undefined);
  return new Response(null, { status: 302, headers });
}

/**
 * A reader or library address with a trailing slash (`/Genesis.1/`): the canonical address without it, as a permanent redirect
 * (308 keeps the method; the router's own normalisation answered 307, a temporary one crawlers do not consolidate). Django's paths
 * and the auth pages keep their slashes. Null when nothing is to be done.
 */
export function trailingSlashRedirect(url: URL, method: string): Response | null {
  const { pathname } = url;
  if ((method !== "GET" && method !== "HEAD") || pathname === "/" || !pathname.endsWith("/")) return null;
  // a path starting with two slashes would make the Location protocol-relative (//evil.com: an open redirect); never redirect one
  if (/^\/[\/\\]/.test(pathname)) return null;
  if (isDjangoPath(pathname, method) || resetLinkUid(pathname) || /^\/(login|register|password)\//.test(pathname)) return null;
  return new Response(null, { status: 308, headers: { location: `${pathname.replace(/\/+$/, "")}${url.search}`, "cache-control": "public, max-age=86400" } });
}
