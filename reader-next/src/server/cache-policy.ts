/**
 * Cache headers for the pages this server renders. A page depends on the request's cookies (interface language,
 * reader settings, version preferences) and, for a signed-in reader, carries who they are (the viewer in the page's data, the gtag
 * user id). So every page says `Vary: Cookie`, and a signed-in reader's page is `private, no-store`: no shared cache in front of
 * this server may keep it and hand one reader's page to another. Django's own pages (passed through) keep their own headers.
 */
/**
 * A page that carries one reader's own data: signed in (`sessionid`), or signed out with a reading history (`user_history`, which the
 * server reads to draw the library home's Recently Viewed, src/lib/library/recently-viewed.ts).
 */
const PERSONAL_COOKIE = /(?:^|;\s*)(?:sessionid|user_history)=[^;]+/;

export function pageCacheHeaders(requestCookie: string | null, response: Headers, status = 200, languagePinned = false): Headers {
  if (response.get("x-served-by") === "django" || !(response.get("content-type") ?? "").includes("text/html")) return response;
  const out = new Headers(response);
  // a page depends on the cookies, and on the visitor's country (diaspora or Israel: the calendars); on a host pinned
  // to a language, whether it is a page at all or the bounce to the other language's domain depends on Accept-Language too
  for (const h of ["Cookie", "CF-IPCountry", ...(languagePinned ? ["Accept-Language"] : [])]) {
    const vary = out.get("vary");
    if (!vary || !new RegExp(`\\b${h}\\b`, "i").test(vary)) out.set("vary", vary ? `${vary}, ${h}` : h);
  }
  if (requestCookie && PERSONAL_COOKIE.test(requestCookie)) out.set("cache-control", "private, no-store");
  // only a rendered page is revalidated; a redirect or an error page keeps whatever it said (a permanent redirect stays cacheable)
  else if (status === 200 && !out.has("cache-control")) out.set("cache-control", "no-cache");
  return out;
}
