/**
 * Old addresses Django answers with nothing but a redirect, answered here instead of a trip through Django's page stack (T-F26).
 * Each is Django's view as it is (reader/views.py, sefaria/urls_shared.py, sefaria/urls_library.py; VERIFIED on www.sefaria.org
 * 2026-11-10: status and Location), except where noted:
 *
 *  - /people, /people/            301 /topics/category/authors            (person_index_redirect)
 *  - /people/Talmud[/]            301 /topics/category/talmudic-figures   (talmud_person_index_redirect)
 *  - /texts/recent[/]             301 /texts/history                      (old_recent_redirect)
 *  - /contributors/<uid>[/<n>]    301 /profile/<uid>                      (profile_redirect; the profile is a Voices page)
 *  - /my/notes[/]                 302 /texts/notes — deliberate difference: Django sends a signed-in reader to /my/profile?tab=notes
 *                                 (the Voices profile) and a signed-out one to /login?next=/my/notes; this client has the notes page
 *                                 itself, which asks a signed-out reader to sign in.
 *  - /random/link                 302 /<a random segment>                 (random_redirect: the same random_ref() as
 *                                 /api/texts/random, whose redirect names the ref)
 *
 * Left to Django: /person/<name> (the old person key is looked up in the database, PersonTopic.get_person_by_key; Django's answer is
 * a redirect to /topics/<slug>, which this client renders, so it is not a way out), /random (a page of Django's own), and /community
 * (a redirect to the Voices home of the interface language's domain: Voices is out of scope).
 *
 * @feature RTE-037 Legacy redirects (complete list)
 * @feature RTE-012 Random text URLs
 * @feature RTE-015 Torah tracker and notes URLs
 */
import { SEFARIA_API_ORIGIN } from "~/lib/api/client";

// No Cache-Control on a permanent redirect, as Django sends none (the cache policy adds Vary; a signed-in reader's is made private)
const permanent = (location: string) =>
  new Response(null, { status: 301, headers: { location, "content-type": "text/html; charset=utf-8", "x-served-by": "reader-redirect" } });
const temporary = (location: string) =>
  new Response(null, { status: 302, headers: { location, "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-served-by": "reader-redirect" } });

/** The fixed redirects (no data needed), or null. */
export function fixedRedirect(pathname: string, method: string): Response | null {
  if (method !== "GET" && method !== "HEAD") return null;
  if (/^\/people\/?$/.test(pathname)) return permanent("/topics/category/authors");
  if (/^\/people\/Talmud\/?$/.test(pathname)) return permanent("/topics/category/talmudic-figures");
  if (/^\/texts\/recent\/?$/.test(pathname)) return permanent("/texts/history");
  if (/^\/my\/notes\/?$/.test(pathname)) return temporary("/texts/notes");
  // Django's pattern: ^contributors/(?P<uid>[^/]+)(/(?P<page>\d+))?$ — the uid as written (still escaped) goes into the Location
  const c = /^\/contributors\/([^/]+)(?:\/\d+)?$/.exec(pathname);
  if (c) return permanent(`/profile/${c[1]}`);
  return null;
}

/**
 * /random/link: a 302 to a random segment. The API's /api/texts/random answers with a redirect to /api/texts/<ref>?commentary=0&context=0
 * (the same random_ref() and the same iri_to_uri as random_redirect); its path is the Location. Null when the API cannot say (then
 * Django is asked).
 */
export async function randomLinkRedirect(pathname: string, method: string, fetcher: typeof fetch = fetch): Promise<Response | null | "fallback"> {
  if ((method !== "GET" && method !== "HEAD") || pathname !== "/random/link") return null;
  try {
    const r = await fetcher(`${SEFARIA_API_ORIGIN}/api/texts/random`, { redirect: "manual" });
    await r.body?.cancel().catch(() => undefined);
    const loc = r.headers.get("location");
    if (r.status < 300 || r.status >= 400 || !loc) return "fallback";
    const path = new URL(loc, "https://x").pathname;
    const m = /^\/api\/texts\/(.+)$/.exec(path);
    return m ? temporary(`/${m[1]}`) : "fallback";
  } catch {
    return "fallback";
  }
}
