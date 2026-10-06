/**
 * Light/dark site theme: the single source of truth for the client side.
 *
 * How the theme reaches the page:
 *   1. The user's choice lives in the `theme` cookie (`light` | `dark`). There is no other store.
 *   2. Django validates the cookie (sefaria/system/theme.py) and renders `<html data-theme="…">`
 *      and the matching `<meta name="theme-color">`, so the first paint is already themed.
 *   3. templates/elements/theme_head.html is a tiny inline script that re-applies the cookie
 *      before any stylesheet loads, for templates that render without the server value.
 *   4. After that, only the toggle changes the theme, via writeStoredTheme() + applyTheme().
 * No cookie (or an unrecognised value) always means light.
 *
 * SSR safety: Node requires this module to server-render the toggle, so nothing here touches
 * `document`, `window` or `Sefaria` at import time. Every browser access is inside a function and
 * guarded, and `Sefaria` is looked up lazily (sefaria.js imports this file, so a top-level import
 * back would be circular). The module holds no mutable state, so nothing can leak between
 * visitors on the shared Node process.
 *
 * Parsing rules match Django's `parse_cookie` exactly (last `theme` cookie wins, key and value
 * trimmed, surrounding double quotes removed, no percent-decoding), so the server, the head
 * script and this module always agree on the stored value. A shared fixture
 * (static/js/sefaria/tests/themeCookieCases.json) pins that for all three.
 */

export const THEMES = Object.freeze(['light', 'dark']);   // the stored choices
export const COOKIE = 'theme';
export const DEFAULT_THEME = 'light';
// 20 years, the same lifetime as the other long-lived preference cookies (cookie banner).
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 20;
// Values for <meta name="theme-color">, i.e. the browser chrome around the page. Light is the
// module colour the header has always used; dark is the dark header surface. base.html and
// theme_head.html hard-code the same values (a Jest test keeps them in step).
export const THEME_COLORS = Object.freeze({
  light: Object.freeze({library: '#18345D', voices: '#518159'}),
  dark: '#181818',
});

const getDocument = () => (typeof document !== 'undefined' ? document : undefined);

const getSefaria = () => {
  // Lazy on purpose (see the header comment). Tolerates a jest.mock() factory without `default`.
  const mod = require('./sefaria');
  return (mod && mod.default) || mod;
};

/** Returns `v` if it is a stored theme value ('light' | 'dark'), else null. Case-sensitive, like the server. */
export function normalizeTheme(v) {
  return typeof v === 'string' && THEMES.includes(v) ? v : null;
}

/** The theme to show for a stored value: the stored choice if valid, otherwise light. */
export function resolveTheme(stored) {
  return normalizeTheme(stored) || DEFAULT_THEME;
}

/**
 * Returns the stored theme from a raw `document.cookie` string, or null.
 * Mirrors django.http.cookie.parse_cookie: the LAST `theme` entry wins even when its value is
 * invalid, so that a stray duplicate resolves the same way on the server and in the browser.
 */
export function parseThemeCookie(cookieString) {
  if (typeof cookieString !== 'string') { return null; }
  let value = null;
  for (const chunk of cookieString.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq === -1) { continue; }            // Django files a chunk without "=" under key ""
    if (chunk.slice(0, eq).trim() === COOKIE) {
      value = chunk.slice(eq + 1).trim();
    }
  }
  if (value !== null && value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    value = value.slice(1, -1);           // Django's _unquote
  }
  return normalizeTheme(value);
}

/** The theme stored in the cookie ('light' | 'dark'), or null when unset, invalid or unreadable. */
export function readStoredTheme(doc = getDocument()) {
  if (!doc) { return null; }
  let cookieString;
  try {
    cookieString = doc.cookie;              // throws SecurityError in sandboxed frames
  } catch (e) {
    return null;
  }
  return parseThemeCookie(cookieString);
}

const hostMatchesDomain = (host, domain) => {
  const bare = domain.replace(/^\./, '').toLowerCase();
  host = (host || '').toLowerCase();
  return !!bare && (host === bare || host.endsWith('.' + bare));
};

const defaultCookieDomain = () => {
  try {
    return getSefaria().util.getCookieDomain() || null;
  } catch (e) {
    return null;
  }
};

/**
 * Persists the user's choice. Writes `theme=<v>` for 20 years on path `/`, SameSite=Lax, Secure on
 * https, and on the shared cookie domain (Sefaria.util.getCookieDomain(), e.g. `.sefaria.org`) so
 * Library and Voices share it. When a domain is used, a host-only `theme` cookie is expired first,
 * so the server never receives two `theme` cookies. Expiring first matters: on a bare host
 * (sefaria.org with domain .sefaria.org) browsers treat the two as the same cookie.
 *
 * @param {string} theme      'light' | 'dark'; anything else writes nothing.
 * @param {object} [options]
 * @param {string|null} [options.domain]  Cookie domain. Omit for getCookieDomain(); null for host-only.
 *                                        Ignored (host-only) if the current host is not inside it,
 *                                        because the browser would silently drop the cookie.
 * @param {Document} [options.doc]        For tests; defaults to the global document.
 * @returns {string|null} The cookie string written, or null if nothing was written (SSR, bad value).
 */
export function writeStoredTheme(theme, {domain, doc = getDocument()} = {}) {
  const value = normalizeTheme(theme);
  if (!value || !doc) { return null; }
  const location = doc.location || {};
  let cookieDomain = domain === undefined ? defaultCookieDomain() : domain;
  if (cookieDomain && !hostMatchesDomain(location.hostname, cookieDomain)) {
    cookieDomain = null;
  }
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  try {
    if (cookieDomain) {
      doc.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
    }
    const cookie = `${COOKIE}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax` +
      (cookieDomain ? `; domain=${cookieDomain}` : '') + secure;
    doc.cookie = cookie;
    return cookie;
  } catch (e) {
    return null;                            // cookies unavailable (sandboxed frame)
  }
}

/** The <meta name="theme-color"> value for `theme` on `activeModule` ('library' | 'voices'). */
export function getThemeColor(theme, activeModule) {
  if (resolveTheme(theme) === 'dark') { return THEME_COLORS.dark; }
  return THEME_COLORS.light[activeModule] || THEME_COLORS.light.library;
}

/**
 * Shows `theme` on the page: sets `data-theme` on <html> (which the CSS tokens key off) and
 * updates <meta name="theme-color">. An invalid value applies light. A no-op without a document.
 * @returns {string} the theme applied.
 */
export function applyTheme(theme, root) {
  const value = resolveTheme(theme);
  if (!root) {
    const doc = getDocument();
    root = doc && doc.documentElement;
  }
  if (!root) { return value; }
  root.setAttribute('data-theme', value);
  const doc = root.ownerDocument;
  const meta = doc && doc.querySelector('meta[name="theme-color"]');
  if (meta) {
    const activeModule = doc.body ? doc.body.getAttribute('data-active-module') : null;
    meta.setAttribute('content', getThemeColor(value, activeModule));
  }
  return value;
}

/**
 * The theme currently shown ('light' | 'dark'). In the browser it reads <html data-theme>, which
 * the server and the head script set. Elsewhere (Node SSR) it resolves `Sefaria.theme`, the
 * validated cookie value the server passed in base props.
 */
export function getCurrentTheme() {
  const doc = getDocument();
  if (doc && doc.documentElement) {
    const shown = normalizeTheme(doc.documentElement.getAttribute('data-theme'));
    if (shown) { return shown; }
  }
  let stored = null;
  try {
    stored = getSefaria().theme;
  } catch (e) {
    stored = null;
  }
  return resolveTheme(stored);
}
