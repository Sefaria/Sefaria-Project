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

/** First path segments that are always Django's (sefaria/urls*.py, plus the pages the old site serves under them). */
export const DJANGO_PREFIXES = [
  "api", "_api", "static", "admin", "login", "logout", "register", "password", "account", "accounts", "_allauth", "gauth", "unlink-gauth", "sso",
  "topics", "sheets", "sheets-with-ref", "collections", "groups", "profile", "people", "person", "settings", "calendars", "notifications", "saved",
  "history", "my", "community", "activity", "dashboard", "explore", "garden", "vgarden", "visualize", "translations", "translate", "contributors",
  "download", "data", "linker", "linker-editor", "modtools", "random", "parashat-hashavua", "todays-daf-yomi", "torahtracker", "compare", "edit",
  "add", "new-home", "getstarted", "healthz", "healthz-rollout", "health-check", "sefaria.js", "search-autocomplete-redirecter", "embed", "edit_text",
];
const PREFIX_RE = new RegExp(`^/(?:${DJANGO_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[/.]|$)`);

export const passThroughEnabled = () => typeof process !== "undefined" && process.env.SEFARIA_PASS_THROUGH === "1";

/** Always Django's, whatever this client could render. */
export const isDjangoPath = (pathname: string, method: string) => (method !== "GET" && method !== "HEAD") || PREFIX_RE.test(pathname);

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
  const res = await fetch(`${API_ORIGIN}${url.pathname}${url.search}`, init);
  const out = new Headers(res.headers);
  // fetch has already decoded the body: the length and encoding no longer describe it
  out.delete("content-encoding");
  out.delete("content-length");
  for (const h of HOP_BY_HOP) out.delete(h);
  out.set("x-served-by", "django");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
