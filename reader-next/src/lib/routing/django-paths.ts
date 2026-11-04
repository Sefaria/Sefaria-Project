/**
 * The site's paths that Django serves, not this client: shared by the server (which passes them through, src/server/pass-through.ts)
 * and the browser (which must leave the app to reach them, e.g. when the Library Assistant asks for a topic page).
 *
 * Not here (rendered by this client since the auth port): "login", "register" and "password" (the reset link); "translations" (the
 * translations-by-language pages, since their port) — on the Library host only, see LIBRARY_HOST_ONLY.
 */

/** First path segments that are always Django's (sefaria/urls*.py, plus the pages the old site serves under them). */
export const DJANGO_PREFIXES = [
  "api", "_api", "static", "admin", "logout", "account", "accounts", "_allauth", "gauth", "unlink-gauth", "sso",
  "topics", "sheets", "sheets-with-ref", "collections", "groups", "profile", "people", "person", "settings", "calendars", "notifications", "saved",
  "history", "my", "community", "activity", "dashboard", "explore", "garden", "vgarden", "visualize", "translate", "contributors",
  "download", "data", "linker", "linker-editor", "modtools", "random", "parashat-hashavua", "todays-daf-yomi", "torahtracker", "compare", "edit",
  "add", "new-home", "getstarted", "healthz", "healthz-rollout", "health-check", "sefaria.js", "search-autocomplete-redirecter", "embed", "edit_text",
  "enable-library-assistant",
];
const PREFIX_RE = new RegExp(`^/(?:${DJANGO_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[/.]|$)`);

/**
 * First path segments this client renders on the Library host only. On the Voices host (voices.sefaria.org, chiburim.sefaria.org.il) they stay Django's: which
 * pages each module serves is not decided yet (TARGET_ARCHITECTURE Q-E1), so a Voices request for them is passed through as before.
 */
export const LIBRARY_HOST_ONLY = ["translations"];
const LIBRARY_ONLY_RE = new RegExp(`^/(?:${LIBRARY_HOST_ONLY.join("|")})(?:[/.]|$)`);

/**
 * Is this host the Voices module's? English: voices.sefaria.org (voices.<any root domain>, a local voices.localhost); Hebrew:
 * chiburim.sefaria.org.il (staging chiburim.sef-stage-il.org) — the hosts Django's DOMAIN_MODULES gives the "voices" module.
 */
export const isVoicesHost = (host: string | null | undefined): boolean => !!host && /^(?:voices|chiburim)\./i.test(host);

/**
 * Is this path (as written, starting with "/") one of Django's pages — on this host, when it is known? A Library-only path with a
 * trailing slash (`/translations/de/`) stays Django's too: Django's own pattern takes "de/" as the slug and answers 404, and so must we
 * (rather than redirect to the address without the slash).
 */
export const isDjangoPage = (pathname: string, host?: string | null): boolean =>
  PREFIX_RE.test(pathname) || (LIBRARY_ONLY_RE.test(pathname) && (isVoicesHost(host) || pathname.endsWith("/")));
