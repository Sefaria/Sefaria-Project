/**
 * The site's paths that Django serves, not this client: shared by the server (which passes them through, src/server/pass-through.ts)
 * and the browser (which must leave the app to reach them, e.g. when the Library Assistant asks for a topic page).
 *
 * Not here (rendered by this client since the auth port): "login", "register" and "password" (the reset link); since the calendars
 * port, "calendars" (the Learning Schedules page) and the shortcuts "parashat-hashavua" and "todays-daf-yomi" (this server answers
 * their redirect) — on the Library host only (LIBRARY_ONLY_PREFIXES).
 */

/** First path segments that are always Django's (sefaria/urls*.py, plus the pages the old site serves under them). */
export const DJANGO_PREFIXES = [
  "api", "_api", "static", "admin", "logout", "account", "accounts", "_allauth", "gauth", "unlink-gauth", "sso",
  "topics", "sheets", "sheets-with-ref", "collections", "groups", "profile", "people", "person", "settings", "notifications", "saved",
  "history", "my", "community", "activity", "dashboard", "explore", "garden", "vgarden", "visualize", "translations", "translate", "contributors",
  "download", "data", "linker", "linker-editor", "modtools", "random", "torahtracker", "compare", "edit",
  "add", "new-home", "getstarted", "healthz", "healthz-rollout", "health-check", "sefaria.js", "search-autocomplete-redirecter", "embed", "edit_text",
  "enable-library-assistant",
];
const PREFIX_RE = new RegExp(`^/(?:${DJANGO_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[/.]|$)`);

/** Is this path (as written, starting with "/") one of Django's pages? */
export const isDjangoPage = (pathname: string): boolean => PREFIX_RE.test(pathname);

/**
 * First path segments this client answers on the Library host only. On the Voices host (voices.sefaria.org; the Library/Voices host
 * model is undecided, Q-E1) Django keeps them: the server passes them through there (src/start.ts).
 */
export const LIBRARY_ONLY_PREFIXES = ["calendars", "parashat-hashavua", "todays-daf-yomi"];
const LIBRARY_ONLY_RE = new RegExp(`^/(?:${LIBRARY_ONLY_PREFIXES.join("|")})(?:/|$)`);
export const isLibraryOnlyPage = (pathname: string): boolean => LIBRARY_ONLY_RE.test(pathname);

/**
 * Is this request's host the Voices site? Its host is the configured Voices origin's (PUBLIC_VOICES_ORIGIN), or any host whose first
 * label is "voices" (voices.sefaria.org, voices.<cauldron>.cauldron.sefaria.org, voices.localhost) or "chiburim" (the Hebrew Voices site).
 */
export function isVoicesHost(host: string | null | undefined, voicesOrigin?: string): boolean {
  const name = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!name) return false;
  if (voicesOrigin) {
    try {
      if (new URL(voicesOrigin).hostname.toLowerCase() === name) return true;
    } catch {
      /* not a URL: fall back to the label */
    }
  }
  return /^(voices|chiburim)\./.test(name);
}

/**
 * Paths this server answers with a redirect rather than a page (the calendar shortcuts): the browser must load them, as it loads a
 * Django page, instead of asking the router (which has no page there).
 */
const SERVER_REDIRECT_RE = /^\/(?:parashat-hashavua|todays-daf-yomi)(?:\/|$)/;
export const isServerRedirect = (pathname: string): boolean => SERVER_REDIRECT_RE.test(pathname);

/**
 * Does the browser have to leave the app (a full page load) to reach this path? Django's pages and the server's redirects — and, on
 * the Voices host (`host`, checked against `voicesOrigin` as isVoicesHost does), the Library-only pages, which Django answers there.
 * Without a host the Library host is assumed.
 */
export const leavesClient = (pathname: string, host?: string, voicesOrigin?: string): boolean =>
  isDjangoPage(pathname) || isServerRedirect(pathname) || (host !== undefined && isLibraryOnlyPage(pathname) && isVoicesHost(host, voicesOrigin));

/** The browser's host, for leavesClient; undefined on the server. */
export const browserHost = (): string | undefined => (typeof window === "undefined" ? undefined : window.location.host);
