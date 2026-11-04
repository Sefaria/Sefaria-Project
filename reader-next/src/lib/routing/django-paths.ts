/**
 * The site's paths that Django serves, not this client: shared by the server (which passes them through, src/server/pass-through.ts)
 * and the browser (which must leave the app to reach them, e.g. when the Library Assistant asks for a topic page).
 *
 * Not here (rendered by this client since their ports): "login", "register" and "password" (the reset link); "translations" (the
 * translations-by-language pages); "calendars" (the Learning Schedules page) and the shortcuts "parashat-hashavua" and
 * "todays-daf-yomi" (this server answers their redirect); "compare" (the version-diff tool); "topics" (the landing page, categories,
 * A–Z and a single topic, /topics/<slug> and /topics/b/<slug>: a topic whose Library pool cannot be confirmed is a 404 here and so goes
 * on to Django, features/topics). All of these on the Library host only (LIBRARY_ONLY_PREFIXES); the Voices host keeps Django's.
 */

/** First path segments that are always Django's (sefaria/urls*.py, plus the pages the old site serves under them). */
export const DJANGO_PREFIXES = [
  "api", "_api", "static", "admin", "logout", "account", "accounts", "_allauth", "gauth", "unlink-gauth", "sso",
  "sheets", "sheets-with-ref", "collections", "groups", "profile", "people", "person", "settings", "notifications", "saved",
  "history", "my", "community", "activity", "dashboard", "explore", "garden", "vgarden", "visualize", "translate", "contributors",
  "download", "data", "linker", "linker-editor", "modtools", "random", "torahtracker", "edit",
  "add", "new-home", "getstarted", "healthz", "healthz-rollout", "health-check", "sefaria.js", "search-autocomplete-redirecter", "embed", "edit_text",
  "enable-library-assistant",
];
const PREFIX_RE = new RegExp(`^/(?:${DJANGO_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[/.]|$)`);

/**
 * First path segments this client renders on the Library host only. On the Voices host (voices.sefaria.org, chiburim.sefaria.org.il)
 * they stay Django's: which pages each module serves is not decided yet (TARGET_ARCHITECTURE Q-E1), so a Voices request for them is
 * passed through as before (src/start.ts).
 */
export const LIBRARY_ONLY_PREFIXES = ["translations", "calendars", "parashat-hashavua", "todays-daf-yomi", "compare", "topics"];
/** @deprecated the translations, compare and topics ports' names for LIBRARY_ONLY_PREFIXES */
export const LIBRARY_HOST_ONLY = LIBRARY_ONLY_PREFIXES;
export const LIBRARY_HOST_ONLY_PREFIXES = LIBRARY_ONLY_PREFIXES;
export const VOICES_DJANGO_PREFIXES = LIBRARY_ONLY_PREFIXES;
const LIBRARY_ONLY_RE = new RegExp(`^/(?:${LIBRARY_ONLY_PREFIXES.join("|")})(?:[/.]|$)`);
export const isLibraryOnlyPage = (pathname: string): boolean => LIBRARY_ONLY_RE.test(pathname);

/**
 * Library-only paths that stay Django's with a trailing slash: Django's translations pattern takes "de/" as the slug and answers 404,
 * and so must we (rather than redirect to the address without the slash). "/calendars/" is not one: it is a page of its own on sefaria.org.
 */
const DJANGO_WITH_SLASH_RE = /^\/translations(?:\/.*)?\/$/;

/**
 * Is this request's host the Voices site? Its host is the configured Voices origin's (PUBLIC_VOICES_ORIGIN), or any host whose first
 * label is "voices" (voices.sefaria.org, voices.<cauldron>.cauldron.sefaria.org, voices.localhost) or "chiburim" (the Hebrew Voices site,
 * chiburim.sefaria.org.il, staging chiburim.sef-stage-il.org) — the hosts Django's DOMAIN_MODULES gives the "voices" module.
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
 * Is this path (as written, starting with "/") one of Django's pages — on this host, when it is known? The Library-only pages are
 * Django's on the Voices host, and a translations path with a trailing slash is Django's everywhere.
 */
export const isDjangoPage = (pathname: string, host?: string | null, voicesOrigin?: string): boolean =>
  PREFIX_RE.test(pathname) || DJANGO_WITH_SLASH_RE.test(pathname) || (isLibraryOnlyPage(pathname) && isVoicesHost(host, voicesOrigin));

/**
 * Paths this server answers with a redirect rather than a page (the calendar shortcuts): the browser must load them, as it loads a
 * Django page, instead of asking the router (which has no page there).
 */
const SERVER_REDIRECT_RE = /^\/(?:parashat-hashavua|todays-daf-yomi)(?:\/|$)/;
export const isServerRedirect = (pathname: string): boolean => SERVER_REDIRECT_RE.test(pathname);

/** Is this path Django's on this host: one of {@link DJANGO_PREFIXES}, or a Library-only page asked for on the Voices host? */
export const isDjangoPageOnHost = (pathname: string, host: string | null | undefined, voicesOrigin?: string): boolean => isDjangoPage(pathname, host, voicesOrigin);
export const isDjangoPageForHost = isDjangoPageOnHost;

/**
 * Does the browser have to leave the app (a full page load) to reach this path? Django's pages and the server's redirects — and, on
 * the Voices host (`host`, checked against `voicesOrigin` as isVoicesHost does), the Library-only pages, which Django answers there.
 * Without a host the Library host is assumed.
 */
export const leavesClient = (pathname: string, host?: string, voicesOrigin?: string): boolean =>
  isDjangoPage(pathname, host, voicesOrigin) || isServerRedirect(pathname);

/** The browser's host, for leavesClient; undefined on the server. */
export const browserHost = (): string | undefined => (typeof window === "undefined" ? undefined : window.location.host);
