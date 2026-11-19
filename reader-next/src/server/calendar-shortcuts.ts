/**
 * /parashat-hashavua and /todays-daf-yomi: a 302 to this week's portion / today's daf, answered here rather than handed to Django.
 *
 * Django's views (reader/views.py parashat_hashavua_redirect, daf_yomi_redirect) take today's items with the defaults — diaspora, no
 * custom, the server's time zone — whatever the request says (`?diaspora=0` is read and ignored), and answer
 * `redirect(iri_to_uri("/" + item["url"]))`: 302, empty body, `Content-Type: text/html; charset=utf-8`. This asks the same API for the
 * same items (`/api/calendars?diaspora=1`, no time zone: the API's default is the server's) and writes the same Location, so the
 * answer is the old one byte for byte without a trip through Django's page stack.
 *
 * Exact paths only: `/parashat-hashavua/` is a 404 on sefaria.org and stays Django's. Library host only: on the Voices host Django
 * answers these paths (404) and they are passed through (src/start.ts).
 *
 * @feature CAL-003 Calendar APIs and quick redirects
 * @feature RTE-010 Learning schedules and calendar URLs
 */
import { SEFARIA_API_ORIGIN, apiJson } from "~/lib/api/client";
import { CALENDAR_SHORTCUTS, calendarsUrl, shortcutLocation, type CalendarItem } from "~/lib/library/calendars";

export const isCalendarShortcut = (pathname: string) => Object.hasOwn(CALENDAR_SHORTCUTS, pathname);

/**
 * The redirect for a shortcut path, or null when the path is not one (or the method is not a read). When the API cannot answer, or
 * today has no such schedule, `fallback` decides (Django's answer when passing through is on, else a 503).
 */
export async function calendarShortcut(pathname: string, method: string, fallback: () => Promise<Response> | Response, fetcher: typeof fetch = fetch): Promise<Response | null> {
  if ((method !== "GET" && method !== "HEAD") || !isCalendarShortcut(pathname)) return null;
  let location: string | null = null;
  try {
    const r = await fetcher(calendarsUrl(SEFARIA_API_ORIGIN, true));
    const items = (await apiJson<{ calendar_items: CalendarItem[] }>(r, "Calendars")).calendar_items;
    location = shortcutLocation(items, CALENDAR_SHORTCUTS[pathname]!);
  } catch {
    location = null;
  }
  if (!location) return fallback();
  return new Response(null, { status: 302, headers: { location, "content-type": "text/html; charset=utf-8", vary: "Accept-Language, Cookie" } });
}

/**
 * The Voices host's answer for the Library-only paths (/calendars, the shortcuts) when this server cannot hand them to Django (pass-through
 * off, as in dev and e2e): live voices.sefaria.org answers 404 there, so this does too, rather than render the Library page.
 */
export const voicesNotFound = (): Response =>
  new Response("Not Found", { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-served-by": "reader-voices-404" } });
