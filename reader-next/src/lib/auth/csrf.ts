/**
 * The CSRF token every write to Django sends as `X-CSRFToken`.
 *
 * The old client read Django's `<meta name="csrf-token">`, because on a cauldron the browser holds TWO `csrftoken` cookies (the
 * production `.sefaria.org` one and the cauldron's own) and a naive reader takes the first while Django's parse_cookie keeps the
 * LAST. This client has no Django-rendered meta tag, so it reads the cookie the way Django does: the last `csrftoken` in the cookie
 * string (document.cookie lists cookies in the same order as the Cookie header the browser sends).
 *
 * A reader who arrives on /login without ever having touched Django may have no csrftoken cookie yet: `ensureCsrfToken()` then asks
 * allauth's headless session endpoint, a GET that always sets the cookie (allauth's browser_view calls get_token()).
 *
 * @feature ACC-008 Auth page with choose / email views
 */
export const CSRF_BOOTSTRAP_URL = "/_allauth/browser/v1/auth/session";

/** The value of the LAST `csrftoken` cookie in a cookie string, or "" (Django's parse_cookie: later duplicates win). */
export function csrfFromCookieString(cookies: string): string {
  let token = "";
  for (const part of cookies.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === "csrftoken") token = decodeURIComponent(part.slice(i + 1).trim());
  }
  return token;
}

/** The token in this browser now ("" on the server, where there is nothing to protect). */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  return csrfFromCookieString(document.cookie);
}

let pending: Promise<string> | null = null;

/** The token, fetching the cookie first if the browser has none yet. Never throws: "" if it could not be had (the write then 403s). */
export async function ensureCsrfToken(): Promise<string> {
  const now = getCsrfToken();
  if (now || typeof window === "undefined") return now;
  pending ??= fetch(new URL(CSRF_BOOTSTRAP_URL, window.location.href).href, { credentials: "same-origin" })
    .catch(() => undefined)
    .then(() => getCsrfToken())
    .finally(() => {
      pending = null;
    });
  return pending;
}
