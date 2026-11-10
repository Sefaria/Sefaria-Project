"""Wave 2, lane GS (shell polish): head, titles, Recently Viewed, dedication, Hebrew header, carry-overs. Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))


def add(fid, lines):
    print(fid, by[fid]["name"])
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


def set_status(fid, value):
    print(fid, by[fid]["name"], "->", value["status"])
    status[fid] = value


V = "VERIFIED 2026-11-10 on www.sefaria.org (lane GS, Playwright at 1280px and with a phone User-Agent"

# --- T-G03: library modules -------------------------------------------------------------------------------
add("LIB-025", [
    V + ", a user_history cookie of six items): the module shows the newest item of each of the first three books, sheets left out (Genesis 1:3, Berakhot 2a, Exodus 3), after the promo slot and before Translations; items 18px serif black with a bullet between, 'All history ›' 16px grey under them; signed out, All history opens the sign-up modal (view history). Phone: a #fbfbfa band above the categories, its header row the 16px title and 'All History' right-aligned, the list under it.",
    "BUILT 2026-11-10: src/lib/library/recently-viewed.ts (GET /api/profile/user_history?secondary=0&annotate=1&limit=20, asked by the server with the reader's cookies when there is a session or a user_history cookie, so it is in the first paint), src/features/library/RecentlyViewedModule.tsx, src/ui/NavSidebar/NavSidebar.tsx RecentlyViewed. The old recently_viewed gtag events (ref, all_history with logged_in). Tests: src/lib/library/recently-viewed.test.ts, e2e/library.spec.ts ('Recently Viewed on the library home').",
])
set_status("LIB-025", {"status": "done", "by": "src/features/library/RecentlyViewedModule.tsx"})
add("LIB-004", ["BUILT 2026-11-10: the phone's inline Recently Viewed band above the categories (LIB-025). Tests: e2e/library.spec.ts ('on a phone')."])
set_status("LIB-004", {"status": "done", "by": "src/ui/LibraryHome/LibraryHome.tsx"})
set_status("LIB-007", {"status": "partial", "note": "About, promo slot, Recently Viewed, Translations, Learning Schedules, Resources and footer in order; the promo slot's CMS content is not built (live Strapi query fails, see PRM-012)"})
add("LIB-005", [
    "BUILT 2026-11-10: the sheet is read through its gviz endpoint (docs.google.com/spreadsheets/d/11c9…/gviz/tq?tq=select A, B, C&tqx=out:json, which sends CORS headers for sefaria.org) instead of loading Google Charts; the day turns at 6 pm local time; the band (#fbfbfa, 26px 19px, 18px, English italic Garamond, Hebrew Heebo) under the title, above Recently Viewed on a phone. Shown after load, as the old page. The sheet answered empty rows for 2026-11-10 and -11, so the band was checked with a stand-in answer. Tests: src/lib/library/dedication.test.ts, e2e/library.spec.ts ('the daily dedication').",
])
set_status("LIB-005", {"status": "done", "by": "src/features/library/DedicationBanner.tsx"})

# --- GUI-006: dead on sefaria.org ------------------------------------------------------------------------
add("GUI-006", ["Checked 2026-11-10 (lane GS): GLOBAL_WARNING_MESSAGE no longer reaches the client: commit 2493041b8f (2020, 'Remove Global warning var') took it out of context_processors.py and data.js; Misc.jsx's GlobalWarningMessage reads a Sefaria.globalWarningMessage nothing sets, and the helm values only fill a Django setting nothing reads. Nothing to port."])
set_status("GUI-006", {"status": "n/a", "note": "Dead on sefaria.org since 2493041b8f (2020): nothing sets the message"})

# --- head items --------------------------------------------------------------------------------------------
HEAD = "BUILT 2026-11-10 (lane GS): src/lib/shell/site-head.ts, in the root route's head on every page but the standalone ones: rel=search OpenSearch (title 'Sefaria Search', /static/files/opensearch.xml), the Library's shortcut icon, SVG and PNG icons and 180px apple-touch-icon (/static/icons/library/…?v=3), /site.webmanifest?v=3 (linked only when Django is the page's own origin: a cross-origin manifest needs CORS), apple-mobile-web-app-capable, apple-itunes-app app-id=1163273965, theme-color #18345D, apple-mobile-web-app-title Library/ספרייה. As base.html (curl of /texts, 2026-11-10). Tests: src/lib/shell/site-head.test.ts, e2e/shell.spec.ts ('the head links OpenSearch and the icons')."
for fid in ["PLT-028", "PLT-017", "PLT-020", "PLT-021", "PLT-001", "PLT-018", "PLT-010"]:
    add(fid, [HEAD])
set_status("PLT-028", {"status": "done", "by": "src/lib/shell/site-head.ts"})
set_status("PLT-017", {"status": "done", "note": "The head links the manifest (same origin) and the icons; Django serves the files", "by": "src/lib/shell/site-head.ts"})
set_status("PLT-020", {"status": "done", "note": "The Library's manifest is linked; the Voices module is out of scope", "by": "src/lib/shell/site-head.ts"})
set_status("PLT-021", {"status": "done", "note": "The Library's icons are linked; Voices out of scope", "by": "src/lib/shell/site-head.ts"})
set_status("PLT-001", {"status": "done", "note": "Django serves the files (pass-through); the reader's head links the icons and manifest", "by": "src/lib/shell/site-head.ts"})
set_status("PLT-018", {"status": "partial", "note": "Get-the-app module and apple-itunes-app meta built; app-link files served by Django; no_applink is not stripped"})
set_status("PLT-010", {"status": "partial", "note": "GTM, gtag, Simple Analytics, Google Identity, reCAPTCHA, chatbot, html lang, OpenSearch, icons, iTunes banner and theme-color done; VWO/Hotjar/Unbounce missing (ANL-014)"})

# --- titles and descriptions -------------------------------------------------------------------------------
add("PLT-006", [
    V + "; descriptions with curl, titles as document.title after load): the old client replaces the server's title after hydration ('Genesis | Sefaria Library' → 'Genesis | The Sefaria Library'; Hebrew 'בראשית | האוסף של ספריא'); /texts 'Sefaria: a Living Library of Jewish Texts Online' (he 'ספריא: ספרייה חיה של טקסטים יהודיים'); a category 'Tanakh, Torah | The Sefaria Library', its description its enDesc, else its short description, else 'Read <cats> texts online with commentaries and connections.'; a book its description then 'Read the text of <book> online with commentaries and connections.' (English in both interfaces); search '<q> | The Sefaria Library' or 'Search'/'חיפוש'. The descriptions repeat as og:description and twitter:description, the titles as og:title and twitter:title (base.html meta_desc/meta_title).",
    "BUILT 2026-11-10 for the library home, category, book and search pages: src/lib/library/page-head.ts. Not ported: the Hebrew category description's doubled escaping ('התנ&quot;ך'), and a book without a Hebrew title in the old client's cache titled in English (Pesach Haggadah). Tests: src/lib/library/page-head.test.ts, e2e/library.spec.ts. Text pages keep '<ref> | Sefaria Reader' and no description (the reader route, lane GR).",
])
set_status("PLT-006", {"status": "partial", "note": "Library home, category, book, search, topics, calendars and translations as sefaria.org; text pages' titles and descriptions not yet (reader route)"})
add("PLT-007", ["BUILT 2026-11-10: /search carries robots 'noindex, nofollow' (reader/views.py search). Tests: e2e/library.spec.ts."])
set_status("PLT-007", {"status": "done", "note": "noindex on search, sparse topic pages and revision history; sheets and collections are Voices", "by": "src/lib/library/page-head.ts"})
set_status("RTE-029", {"status": "done", "note": "q, tab, filters, exact and sort in the URL (e2e/search-page); noindex as sefaria.org; sheet params are Voices", "by": "src/routes/search.tsx"})

# --- Hebrew interface header (T-G02) and donate links ------------------------------------------------------
add("GUI-003", [V + ", /interface/hebrew?next=/texts): the desktop bar says טקסטים (the terms dictionary's 'Texts'), נושאים, תרומה; the phone menu says מקורות (header.texts). The Hebrew search box is Heebo 18px, right to left, 216×28.5 at y=15.25 (.interface-hebrew input; no fixed height). BUILT 2026-11-10 (T-G02). Tests: e2e/shell.spec.ts ('the Hebrew interface's bar'), src/ui/SiteHeader/SiteHeader.test.tsx."])
add("PRM-004", ["BUILT 2026-11-10: the header's and phone menu's Donate use the Hebrew campaign (468442) in the Hebrew interface, as DonateLink's Sefaria._v. The sustainer link is used nowhere on sefaria.org (only the default and dayOfLearning variants are rendered). Tests: src/ui/SiteHeader/SiteHeader.test.tsx, e2e/shell.spec.ts."])
set_status("PRM-004", {"status": "done", "note": "Default (English and Hebrew campaigns) and day-of-learning links; the sustainer variant is unused on sefaria.org too", "by": "src/lib/shell/links.ts"})
set_status("PRM-005", {"status": "partial", "note": "c_src attribution on header, phone menu, Support/Sponsor modules and footer, Hebrew campaign in the Hebrew interface; Strapi CTAs not built (PRM-012)"})

# --- search ------------------------------------------------------------------------------------------------
add("SRC-012", ["BUILT 2026-11-10: repairCaseVariant (Sefaria.isACaseVariant/repairCaseVariant) before the gershayim repair in the header's Enter. 'pirkei avot' is not a ref to the name API (VERIFIED 2026-11-10) and opened a word search; now /Pirkei_Avot. Tests: src/lib/search/autocomplete.test.ts, e2e/search-page.spec.ts."])
set_status("SRC-012", {"status": "done", "by": "src/lib/search/autocomplete.ts"})

# --- carry-overs: 404 page, ambiguous topics, /texts/history -----------------------------------------------
add("TOP-036", ["2026-11-10 (lane GS): a topic route's own 404 (the server's answer is final) is the shared 'Page Not Found' page, no longer the plain 'Page not found.'; an in-app 404 still reloads for Django. An ambiguous name's topic (isAmbiguous, e.g. /topics/רג-(ambiguous) from Berakhot 2a's sidebar) is rendered as sefaria.org does (h1, an empty Explore Topics, noindex) instead of a 404: the name completer never offers it, so the pool check took it for a non-Library topic. Tests: e2e/topic-page.spec.ts, e2e/topics-category.spec.ts."])
add("RTE-040", ["2026-11-10: the topics routes' not-found is the shared NotFoundPage too (DjangoHandoff keeps only its reload for an in-app 404)."])
add("LIB-069", ["2026-11-10: /texts/history (where Django's /texts/recent redirects) and any path naming no category is the library home with the home's title and description, as sefaria.org (was titled 'history | …'). Tests: e2e/library.spec.ts."])

# --- T-G06 -------------------------------------------------------------------------------------------------
add("TOP-029", ["T-G06 (lane GS, 2026-11-10): dimension5 is Universal Analytics (track.js ga(SET, 'dimension5')), which the new reader does not send (owner decision 2026-11-10): nothing to port. The landing modules' data-anl-* (Featured Topic, Multi-Cards, Parashah, Calendar, Search, Topic Salad, newsletter) were already in src/ui/TopicsNav/TopicLanding.tsx, checked against static/js/TopicLandingPage/*.jsx. Synthetic vs real bold line breaks: accepted as recorded in the topic page entries."])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
