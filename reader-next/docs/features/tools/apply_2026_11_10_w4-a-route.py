"""Wave 4, lane a-route, 2026-11-10: the reader's CSS in the server-rendered head (v-exits F-2), reader page titles (v-parity S2,
v-a11y S4), the Hebrew interface's default text language (v-parity B1), node addresses of complex texts (v-exits F-4), the book TOC
on counts shallower than the depth (v-exits F-5). Idempotent: run twice, nothing changes."""

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
    "PLT-003",
    [
        "FIXED 2026-11-10 (wave 4, v-exits F-2): the server-rendered head links each page kind's stylesheets. The $ route's kinds (reader, book page) are dynamic chunks and Start's route manifest lists only static imports' CSS, so the reader's classes (Workspace chunk) came with the JS: an unstyled first paint, a 0.39 shift at hydration. vite-plugins/page-kind-css.ts reads each kind's CSS from the client build into virtual:page-kind-css for the server build; src/routes/$.tsx links it. Measured on a production build (Pixel 7, CPU 4x, Slow 4G, median of 3, API www.sefaria.org): /Genesis.1 CLS 0.484 -> 0, LCP 13,992 -> 3,644 ms. Tests: test/build/page-kind-css.test.ts, e2e/ssr-styles.spec.ts (also against a built server with E2E_SSR_BASE_URL).",
        "FIXED 2026-11-10 (wave 4, staging /Sefer_HaBahir): the book page's CSS was never requested in the browser either: the minifier merged `kind === 'book' ? import(BookRoute) : import(Workspace)` into one preload with the Workspace chunk's dependencies only. Each kind's import is now its own function (src/features/reader/page-kinds.tsx). Guard: e2e/ssr-styles.spec.ts checks, for nine representative routes, that every CSS module in the SSR HTML has rules in a linked stylesheet, and in the browser after an in-app move to the book page.",
    ],
)

add(
    "PLT-006",
    [
        "BUILT 2026-11-10 (wave 4, v-parity S2 / v-a11y S4): reader titles as www.sefaria.org's client writes them (VERIFIED 2026-11-10): 'Genesis 1 | The Sefaria Library', Hebrew interface 'בראשית א׳ | האוסף של ספריא'; with a sidebar naming a source 'Genesis 1:1 with Rashi' / 'עם רש\"י' (Translations, About, Sheets, Web Pages, Commentary, Quoting Commentary…), none for with=all or a category's list; a missing text is titled as Django's 404 in either interface ('הדף שביקשתם איננו נמצא | ספריא'). Deliberate difference: two panels write the suffix once ('Genesis 1 & Exodus 1 | The Sefaria Library'); legacy repeated it. A book's Hebrew name after 'עם' comes from the catalog when it is in memory (the sidebar loads it); on a cold deep link it stays in English until the next navigation. Code: src/lib/reader/page-title.ts, src/routes/$.tsx, src/routes/__root.tsx. Tests: src/lib/reader/page-title.test.ts, e2e/reader-titles.spec.ts.",
    ],
)
set_status("PLT-006", {"status": "partial", "note": "Library, book, search, topics, calendars, translations and reader titles as sefaria.org; text pages' meta descriptions not yet", "by": "src/lib/library/page-head.ts, src/lib/reader/page-title.ts, src/routes/$.tsx"})

add(
    "I18-001",
    [
        "BUILT 2026-11-10 (wave 4, v-parity B1): with no choice made, the Hebrew interface opens texts in Hebrew, the English one bilingual (legacy sefaria/system/middleware.py:194 default_content_lang); the language/contentLang cookie and the URL's lang still win. Code: src/lib/reader/settings.ts (defaultContentLanguage). Tests: src/lib/reader/settings.test.ts, e2e/reader-titles.spec.ts.",
    ],
)
set_status("I18-001", {"status": "partial", "note": "Translation and version preferences from cookies; content language defaults to Hebrew in the Hebrew interface; country suggestion not yet", "by": "src/lib/reader/settings.ts, src/lib/versions/prefs-source.ts"})

add(
    "TXT-023",
    [
        "FIXED 2026-11-10 (wave 4, v-exits F-4): a node address with no section (/Arukh_HaShulchan,_Orach_Chaim) asked /api/v3/texts for the whole node (5.9 MB, 13.5 s: a 503). It now asks /api/ref for first_available_section_ref and opens that section (301 to /Arukh_HaShulchan,_Orach_Chaim.1, as other refs above section level here; legacy answers 200 at the node's address). Code: src/lib/text/queries.ts. Tests: src/lib/text/queries.test.ts, e2e/node-address.spec.ts.",
    ],
)

add(
    "BOK-013",
    [
        "FIXED 2026-11-10 (wave 4, v-exits F-5): counts shallower than the node's depth (a depth-3 node with only lengths, or ragged counts) threw 'counts.forEach is not a function' in SSR; such a level now draws nothing, as the old page's loop did. Code: src/lib/toc/model.ts. Tests: src/lib/toc/model.test.ts.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
