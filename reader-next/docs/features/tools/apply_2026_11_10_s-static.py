"""Wave 2, lane S (static information pages), 2026-11-10: T-F31 (one static-page route rendering Django's content block in the new
shell) and T-F32 (pages with behaviour: /mobile ported, the rest classified). Idempotent: run twice, nothing changes."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))

NAMES = {
    "STA-001": "Static content pages",
    "STA-003": "Metrics and digitized-by-Sefaria pages",
    "STA-005": "Static page serving and About sidebar",
    "STA-006": "About, strategy, story and supporters pages",
    "STA-007": "Terms and privacy policy",
    "STA-008": "Product, tool and edition pages",
    "STA-009": "Jobs page",
    "STA-010": "Team page",
    "STA-011": "Products page",
    "STA-012": "Educators, Word-by-Word, newsletter and sponsorship pages",
    "STA-013": "Ways to give / donate page",
    "STA-017": "Metrics, digitized versions, annual report, 990, llms.txt",
    "LEG-022": "Library metrics charts (/metrics)",
    "LEG-024": "Digitized by Sefaria list",
    "ADM-056": "Dedications",
    "PRM-016": "Newsletter signup form",
}
for fid, name in NAMES.items():
    assert by[fid]["name"] == name, (fid, by[fid]["name"], name)


def add(fid, lines):
    print(fid, "-", by[fid]["name"])
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


def set_status(fid, value):
    print(fid, "-", by[fid]["name"], "->", value["status"])
    status[fid] = value


MECH = "src/routes/$page.tsx, src/features/static-page, src/lib/static-page"
DJANGO_KEPT = "Django's page on every host (lib/static-page/pages.ts; an accepted exit in scripts/exits-allowlist.json)"

add(
    "STA-001",
    [
        "BUILT 2026-11-10 (T-F31, D-5): one route, src/routes/$page.tsx (its params.parse admits only the names of lib/static-page/pages.ts, so every other single-segment address is still the reader's), for the static_pages of sites/sefaria/urls.py (44 in the list, not the plan's 46; /updates excluded: the new reader's own page, lane P), /about and /ways-to-give by language, and /digitized-by-sefaria. The server asks Django GET /<page>?format=json&lang=en|he (reader/static_content.py) through the internal API origin, in the interface language, keeps the answer 5 minutes per page and language, sanitises the content (allowlist: everything the templates use, classes, ids, inline styles, Google Docs/YouTube frames, the Docs frames sandboxed; no scripts, handlers, javascript:/data: addresses — the scheme judged with control characters and whitespace removed, as a browser reads it) and renders it inside base.html's #staticContentWrapper > #content in the new shell, server-rendered.",
        "BUILT 2026-11-10 (T-F31): the content is styled by the old site's own CSS — every stylesheet base.html loads plus static.css, in base.html's order, scoped to #staticContentWrapper, without the @font-face rules of the families the shell declares itself (Taamey Frank, Cardo, Noto Color Emoji: the shell's files stay in use); no other stylesheet is loaded unscoped (one a page lists outside these is left out and logged) (lib/static-page/scope-css.ts) so none of it reaches the header or other pages; generated into lib/static-page/legacy-css.gen.ts (the reader's image is built from reader-next/ alone) and checked against static/ by legacy-css.test.ts; served at /static-page-styles/legacy.<hash>.css (immutable) and linked in the page's head (no unstyled flash; fetched before an in-app navigation shows the page). A page's {% block css %} is scoped the same way so it still wins.",
        "BUILT 2026-11-10 (T-F31): head as the old page: title, description, og/twitter card, the en/he alternates; plus a canonical link (PUBLIC_CANONICAL_ORIGIN for this host's site: the old static pages had none) — deliberate difference. No noindex (the old pages had none). A page Django does not have: the reader's 404. A page still Django's in this language, or a Django without the content mode: handed to Django (the server answers 404 to its own router and site-routing passes the request on; in the app, a full load).",
        "BUILT 2026-11-10 (T-F31): links in the content: a same-site page this client renders navigates in the app; Django's pages (and, on the Voices host, everything Library-only) load in full; other sites, Voices, new windows, modified clicks and anchors are the browser's. On the Voices host every static page is Django's, exactly as before.",
        "Parity 2026-11-10 (scripts in the lane report; www.sefaria.org vs the new shell, desktop 1280 and phone UA 390, English and Hebrew): visible text of the content block identical and the measured layout (widths, x offsets, font sizes and families, weights, line heights, colours, margins of headings, paragraphs, .inner, sidebar, frames, images) equal within 2px on the content pages, except as noted under each page's entry.",
        "Ported (T-F32, the old components' markup and classes in features/static-page/ports): /mobile, /educators, the English /ways-to-give (DonatePage). Not rendered here (" + DJANGO_KEPT + "): jobs, team, products (legacy React filled from the CMS), word-by-word, ramban-sponsorships (legacy React mount points), contest, powered-by-sefaria-contest-2020/2021 (finished contests, not linked from the reader), newsletter (a 1,700-line legacy React flow), aramaic-translation-contest (jQuery form), random-walk-through-torah and cloudflare_site_is_down_en/he (whole documents), metrics (its own view).",
        "Tests: src/lib/static-page/*.test.ts (routing incl. Voices, sanitiser, content, scoped CSS), src/features/static-page/static-page.test.tsx, e2e/static-pages.spec.ts (Django's answers from e2e/fixtures/static-pages written into the cassette: www.sefaria.org does not serve ?format=json yet).",
    ],
)
set_status("STA-001", {"status": "partial", "note": "Content pages rendered in the new shell (T-F31); /mobile, /educators, English /ways-to-give ported; CMS and other legacy-React pages still Django's (pages.ts)", "by": MECH})

add(
    "STA-005",
    [
        "BUILT 2026-11-10 (T-F31): the static-page route serves every page of the list (lib/static-page/pages.ts). The About sidebar as its script left it on a desktop (the sanitiser does it: the sidebar's class is the page, the page's item 'selected'); on a phone the old templates leave the sidebar out ({% if not request.user_agent.is_mobile %}): here hidden at 480px and narrower (Django renders the content for a desktop) — deliberate difference: decided by width, not the user agent (a phone held sideways shows it stacked; a desktop window narrowed under 480px hides it).",
    ],
)
set_status("STA-005", {"status": "done", "note": "One static-page route; About sidebar selected item; hidden on phones", "by": MECH})

add(
    "STA-006",
    [
        "BUILT 2026-11-10 (T-F31): /about (en and he templates), /strategy (its deck width script done here), /supporters, /the-sefaria-story, /pioneers, /testimonials, /link-to-annual-report, /coming-soon and the dedication pages (/shraga-silverstein, /henry-and-julia-koschitzky-apps, /adin-even-israel-steinsaltz, /william-davidson-talmud, /nash-bravmann-collection, /fleishman-hirsch-on-torah-in-english) rendered in the new shell from Django's content block. /dedication/<slug> is the dedications app's view, not a static page: ADM-056.",
    ],
)
set_status("STA-006", {"status": "done", "note": "Rendered in the new shell (T-F31)", "by": MECH})

add(
    "STA-007",
    [
        "BUILT 2026-11-10 (T-F31): /terms and /privacy-policy rendered in the new shell (the Google Docs frame kept), linked in-app from sign-up and the cookie notice.",
    ],
)
set_status("STA-007", {"status": "done", "note": "Rendered in the new shell (T-F31)", "by": MECH})

add(
    "STA-008",
    [
        "BUILT 2026-11-10 (T-F31): /ios, /mobile-about-menu, /linker (its bookmarklet kept: the one javascript: address allowed, and only there), /ai, /torah-tab, /daf-yomi, /dicta-thanks, /sefaria-edition, /sefaria-community-translation, /contributed-to-sefaria, /visualizations, /design-system rendered from Django's content block. /app is Django's redirect to /mobile.",
        "BUILT 2026-11-10 (T-F32): /mobile ported (features/static-page/ports/MobileAppPage.tsx: the old MobileAppPage's markup and classes, styled by the scoped static.css): the store buttons carry a full UTM campaign to the App Store and Google Play from the server's first paint (the old page set them after mounting), and the newsletter sign-up at the bottom (src/ui/NewsletterSignUp, 'Subscribe from Mobile Landing Page').",
        "Still Django's: /random-walk-through-torah and the Cloudflare outage pages (whole documents of their own), /aramaic-translation-contest (a 2019 contest page whose mailing-list form runs on jQuery).",
        "/mobile-about-menu (the app's About menu): rendered as Django renders it for a desktop; the old page's phone variant (a title heading, the sidebar as a full-width overlay) is not reproduced — deliberate difference.",
    ],
)
set_status("STA-008", {"status": "partial", "note": "All but the standalone documents and the 2019 contest page; /mobile ported", "by": MECH + ", src/features/static-page/ports/MobileAppPage.tsx"})

for fid, what in [("STA-009", "/jobs"), ("STA-010", "/team"), ("STA-011", "/products")]:
    add(fid, [f"2026-11-10 (T-F32): {what} is a legacy React page filled from the CMS (Strapi) inside a static template: Django's content block has no data, so it stays {DJANGO_KEPT}. Porting it needs the CMS query in this client."])
    status[fid] = {"status": "todo", "note": f"{what}: Django's page (CMS-driven legacy React), an accepted exit; port needs the CMS query"}
    print(fid, "-", by[fid]["name"], "-> todo (note)")

add(
    "STA-012",
    [
        "BUILT 2026-11-10 (T-F32): /educators ported (features/static-page/ports/EducatorsPage.tsx: the old EducatorsPage's markup and classes inside the static-page frame, styled by the scoped static.css; its newsletter sign-up is this client's, 'Subscribe from educators').",
        "2026-11-10 (T-F32): /word-by-word, /ramban-sponsorships (legacy React mount points) and /newsletter (the 1,700-line NewsletterSignUpPage flow: survey, confirmation, marketing toggles) stay " + DJANGO_KEPT + ". /updates is the new reader's own page (lane P).",
    ],
)
set_status("STA-012", {"status": "partial", "note": "/educators ported; word-by-word, ramban, newsletter still Django's", "by": MECH + ", src/features/static-page/ports/EducatorsPage.tsx"})

add(
    "STA-013",
    [
        "BUILT 2026-11-10 (T-F31, T-F32): the Hebrew /ways-to-give (a plain template) is rendered from Django's content; the English page's DonatePage is ported (features/static-page/ports/DonatePage.tsx, copied from StaticPages.jsx with the same markup: feature boxes, ways to give, the FAQ as <details>, financial stewardship), both in the new shell.",
    ],
)
set_status("STA-013", {"status": "done", "note": "Hebrew page from Django's content, English DonatePage ported", "by": MECH + ", src/features/static-page/ports/DonatePage.tsx"})

add("LEG-024", ["BUILT 2026-11-10 (T-F31): /digitized-by-sefaria rendered from Django's content answer (its own view, which lists the versions digitizedBySefaria)."])
set_status("LEG-024", {"status": "done", "note": "Rendered in the new shell (T-F31)", "by": MECH})

add("STA-003", ["2026-11-10 (T-F31): /digitized-by-sefaria rendered in the new shell; /metrics stays Django's (its own view with d3 charts, no content answer): an accepted exit (LEG-022)."])
set_status("STA-003", {"status": "partial", "note": "/digitized-by-sefaria rendered; /metrics Django's", "by": MECH})

add("STA-017", ["2026-11-10 (T-F31): /digitized-by-sefaria rendered in the new shell. /metrics (its own view), /annualreport (a standalone document), /current-990-form (a redirect to a PDF) and /llms.txt (a text file) stay Django's."])
set_status("STA-017", {"status": "partial", "note": "/digitized-by-sefaria rendered; the rest Django's (not pages of the shell)", "by": MECH})

add("LEG-022", ["2026-11-10 (T-F32): /metrics is its own Django view (charts from db.metrics), not a static template: no content answer; an accepted exit (scripts/exits-allowlist.json static-metrics). Porting it needs an API for the metrics."])
status["LEG-022"] = {"status": "todo", "note": "/metrics: Django's page, an accepted exit; needs a metrics API to port"}
print("LEG-022 -", by["LEG-022"]["name"], "-> todo (note)")

add("ADM-056", ["2026-11-10 (T-F31): /dedication/<slug> is the dedications app's view (an admin-edited model in templates/static/dedication/dedication.html), not a static page; it has no content answer, so it stays Django's: an accepted exit (scripts/exits-allowlist.json 'dedication'). Rendering it in the shell needs ?format=json on that view (request to the Django lane)."])
status["ADM-056"] = {"status": "todo", "note": "/dedication/<slug>: Django's page, an accepted exit; needs ?format=json on the dedications view"}
print("ADM-056 -", by["ADM-056"]["name"], "-> todo (note)")

add("PRM-016", ["2026-11-10 (T-F32): also at the bottom of /mobile (src/features/static-page/ports/MobileAppPage.tsx: no educator option, 'Subscribe from Mobile Landing Page')."])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
