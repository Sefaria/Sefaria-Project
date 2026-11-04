/**
 * The site's paths that Django serves, not this client: shared by the server (which passes them through, src/server/pass-through.ts)
 * and the browser (which must leave the app to reach them, e.g. when the Library Assistant asks for a topic page).
 *
 * Not here (rendered by this client since the auth port): "login", "register" and "password" (the reset link).
 * "topics" (since the topics port): the landing page, categories and A–Z are this client's; a single topic is still Django's
 * (DJANGO_TOPIC_PAGE below), and so is every /topics page on the Voices host (isDjangoPageForHost).
 */

/** First path segments that are always Django's (sefaria/urls*.py, plus the pages the old site serves under them). */
export const DJANGO_PREFIXES = [
  "api", "_api", "static", "admin", "logout", "account", "accounts", "_allauth", "gauth", "unlink-gauth", "sso",
  "sheets", "sheets-with-ref", "collections", "groups", "profile", "people", "person", "settings", "calendars", "notifications", "saved",
  "history", "my", "community", "activity", "dashboard", "explore", "garden", "vgarden", "visualize", "translations", "translate", "contributors",
  "download", "data", "linker", "linker-editor", "modtools", "random", "parashat-hashavua", "todays-daf-yomi", "torahtracker", "compare", "edit",
  "add", "new-home", "getstarted", "healthz", "healthz-rollout", "health-check", "sefaria.js", "search-autocomplete-redirecter", "embed", "edit_text",
  "enable-library-assistant",
];
const PREFIX_RE = new RegExp(`^/(?:${DJANGO_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:[/.]|$)`);

/**
 * Under /topics this client renders /topics, /topics/category/<slug> and /topics/all/<letter>; every other /topics/… path (a single
 * topic, /topics/b/<slug>) is Django's.
 */
const DJANGO_TOPIC_PAGE = /^\/topics\/(?!(?:category|all)(?:\/|$))[^/]/;

/** Is this path (as written, starting with "/") one of Django's pages? */
export const isDjangoPage = (pathname: string): boolean => PREFIX_RE.test(pathname) || DJANGO_TOPIC_PAGE.test(pathname);

/**
 * The Voices host (voices.<domain>, chiburim.<domain>, or the configured Voices origin's host): which product it is is decided by
 * the host (RTE-001), and Voices keeps its own pages for what the Library host renders here — its /topics is the old category grid
 * (TOP-011). The Library/Voices host model of this client is undecided (Q-E1), so these stay Django's there.
 */
export const VOICES_DJANGO_PREFIXES = ["topics"];
const VOICES_PREFIX_RE = new RegExp(`^/(?:${VOICES_DJANGO_PREFIXES.join("|")})(?:[/.]|$)`);

export function isVoicesHost(host: string | null | undefined, voicesOrigin?: string): boolean {
  const h = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!h) return false;
  if (/^(?:voices|chiburim)\./.test(h)) return true;
  if (!voicesOrigin) return false;
  try {
    return new URL(voicesOrigin).hostname.toLowerCase() === h;
  } catch {
    return false;
  }
}

/** Django's page for this host: every Django page, and on the Voices host also the pages it keeps (VOICES_DJANGO_PREFIXES). */
export const isDjangoPageForHost = (pathname: string, host: string | null | undefined, voicesOrigin?: string): boolean =>
  isDjangoPage(pathname) || (isVoicesHost(host, voicesOrigin) && VOICES_PREFIX_RE.test(pathname));
