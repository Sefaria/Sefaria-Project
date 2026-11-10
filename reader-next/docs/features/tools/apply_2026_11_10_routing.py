"""Wave 1, lane E (routing), 2026-11-10: the reader's own 404 and 503 pages, server-side redirects, the language-domain bounce,
relative links to this client's pages, version sources that are not addresses, the exits crawl. Idempotent: run twice, nothing changes."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))


def add(fid, lines):
    print(fid, "-", by[fid]["name"])
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


def set_status(fid, value):
    print(fid, "-", by[fid]["name"], "->", value["status"])
    status[fid] = value


add(
    "RTE-040",
    [
        "BUILT 2026-11-10 (T-F28): a path this client does not render is still handed to Django first; when Django answers 404 too (an HTML page read, not an API's, not on the Voices host) the reader renders its own Page Not Found in the new shell — templates/404.html's words, title 'Page Not Found | Sefaria', 404, X-Robots-Tag and robots meta noindex, Cache-Control no-cache. Mechanism: the request middleware calls the router with a request-context flag and the root route throws notFound() in beforeLoad (src/lib/routing/not-found.ts, src/start.ts). Deliberate difference: live's 404 page has no noindex. Routes with their own not-found (a text: 'Text not found'; topics: 'Page not found.') keep theirs, now noindex.",
        "BUILT 2026-11-10 (T-F28): an upstream failure is an HTML page (src/server/error-page.ts), still 503 + Retry-After 5, no-store, noindex, in the interface language of the cookie, with a 'Try again' link to the same address and templates/500.html's contact line. A fixed document: the app's render would need the API that failed.",
        "Tests: src/lib/routing/not-found.test.ts, src/server/error-page.test.ts, e2e/routing-pass-through.spec.ts (needs a pass-through dev server, E2E_PASS_THROUGH_URL).",
    ],
)
set_status("RTE-040", {"status": "done", "note": "Own 404 page after Django's 404 (noindex), HTML 503 page", "by": "src/lib/routing/not-found.ts, src/features/routing/NotFoundPage.tsx, src/server/error-page.ts, src/start.ts"})

add(
    "RTE-059",
    [
        "BUILT 2026-11-10 (T-E07): src/server/language-domain.ts reproduces LanguageCookieMiddleware and LanguageSettingsMiddleware for the page requests this server answers (Django's own pages do it themselves): the same exclusions, interface from the interfaceLang cookie, else cf-ipcountry (IL = Hebrew), else the Accept-Language match; crawlers (Django's list) stay; a 302 to the language's domain of the same module with the full path and set-language-cookie= appended; ?set-language-cookie sets the session cookie interfaceLang on the language's cookie domain and cleans the address. Reads DOMAIN_MODULES from the environment (Django's JSON); without it nothing is pinned. A signed-in reader's language is in the profile: Django is asked with a probe (GET /people, a fixed redirect; the middleware runs first), cached 5 min per session; a signed-in ?set-language-cookie (which writes the profile) is passed to Django. VERIFIED 2026-11-10: www.sefaria.org from an Israeli address answers 302 https://www.sefaria.org.il/<path>?set-language-cookie= (the same Location shape).",
        "Needs in the cluster: DOMAIN_MODULES in the reader pod's environment (the optin rollout, helm reader.yaml, does not mount local-settings-<env>). Tests: src/server/language-domain.test.ts, e2e/routing-pass-through.spec.ts.",
    ],
)
set_status("RTE-059", {"status": "done", "note": "Bounce reproduced in the reader's server (needs DOMAIN_MODULES in the pod env)", "by": "src/server/language-domain.ts, src/start.ts"})

add(
    "RTE-037",
    [
        "BUILT 2026-11-10 (T-F26): answered by the reader's server (src/server/redirects.ts), same status and Location as Django (VERIFIED on www.sefaria.org 2026-11-10): /people[/] 301 /topics/category/authors, /people/Talmud[/] 301 /topics/category/talmudic-figures, /texts/recent[/] 301 /texts/history, /contributors/<uid>[/<n>] 301 /profile/<uid>. /person/<name> stays Django's (database lookup by the old person key; its answer is a redirect to a topic page this client renders) and so does /community (a redirect to Voices). Tests: src/server/redirects.test.ts, e2e/routing-server.spec.ts.",
    ],
)
set_status("RTE-037", {"status": "partial", "note": "The data-free redirects answered by the reader's server; /person and the rest Django's", "by": "src/server/redirects.ts"})

add(
    "RTE-012",
    [
        "BUILT 2026-11-10 (T-F26): /random/link is a 302 to the ref /api/texts/random's own redirect names (the same random_ref()), answered by the reader's server; Django when the API cannot say. /random (a page of Django's) stays Django's. Tests: src/server/redirects.test.ts.",
    ],
)
set_status("RTE-012", {"status": "partial", "note": "/random/link answered here; /random page Django's", "by": "src/server/redirects.ts"})

add(
    "RTE-015",
    [
        "BUILT 2026-11-10 (T-F26): /my/notes[/] is a 302 to /texts/notes, this client's notes page. Deliberate difference: Django sends a signed-in reader to /my/profile?tab=notes (the Voices profile) and a signed-out one to /login?next=/my/notes. Tests: e2e/routing-server.spec.ts.",
    ],
)

add(
    "VER-017",
    [
        "2026-11-10 (T-F03), deliberate difference: a version source that is not an address (a book's name such as 'Biblia Judaica Completa') is plain text; the old VersionInformation wrote it as a relative link that ended at Django's 404. An address (http(s)://, www., or a site path such as /shraga-silverstein) stays a link; the edition's picture is linked only to an address. Tests: src/ui/VersionInfo/VersionInfo.test.tsx.",
    ],
)

add(
    "GUI-002",
    [
        "2026-11-10 (T-F02): Texts and Topics (desktop and phone menu) are relative links through the router's Link, so they navigate inside the app instead of reloading from www.sefaria.org-style absolute addresses. Tests: e2e/routing-server.spec.ts, src/ui/SiteHeader/SiteHeader.test.tsx.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
