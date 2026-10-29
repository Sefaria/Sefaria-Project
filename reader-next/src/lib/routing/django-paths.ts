/**
 * The site's paths that Django serves, not this client: shared by the server (which passes them through, src/server/pass-through.ts)
 * and the browser (which must leave the app to reach them, e.g. when the Library Assistant asks for a topic page).
 *
 * Not here (rendered by this client since the auth port): "login", "register" and "password" (the reset link).
 */

/** First path segments that are always Django's (sefaria/urls*.py, plus the pages the old site serves under them). */
export const DJANGO_PREFIXES = [
  "api", "_api", "static", "admin", "logout", "account", "accounts", "_allauth", "gauth", "unlink-gauth", "sso",
  "topics", "sheets", "sheets-with-ref", "collections", "groups", "profile", "people", "person", "settings", "calendars", "notifications", "saved",
  "history", "my", "community", "activity", "dashboard", "explore", "garden", "vgarden", "visualize", "translations", "translate", "contributors",
  "download", "data", "linker", "linker-editor", "modtools", "random", "parashat-hashavua", "todays-daf-yomi", "torahtracker", "compare", "edit",
  "add", "new-home", "getstarted", "healthz", "healthz-rollout", "health-check", "sefaria.js", "search-autocomplete-redirecter", "embed", "edit_text",
  "enable-library-assistant",
];
const PREFIX_RE = new RegExp(`^/(?:${DJANGO_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[/.]|$)`);

/** Is this path (as written, starting with "/") one of Django's pages? */
export const isDjangoPage = (pathname: string): boolean => PREFIX_RE.test(pathname);
