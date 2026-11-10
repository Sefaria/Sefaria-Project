"""Wave 2, lane GR (reader polish): reader, sidebar, versions, text types (LAUNCH_PLAN T-G01 for those areas, T-G04, T-G05). Idempotent.

Prints each ID with its name; a second run changes nothing. ATLAS_DIR overrides the directory (to test on a copy).
"""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))

V = "VERIFIED 2026-11-10 on www.sefaria.org (Playwright, lane GR)"


def add(fid, name, lines):
    assert by[fid]["name"] == name, (fid, by[fid]["name"], name)
    print(fid, by[fid]["name"])
    for line in lines:
        if line not in by[fid]["details"]:
            by[fid]["details"].append(line)


def mark(fid, name, st, note, by_paths):
    assert by[fid]["name"] == name, (fid, by[fid]["name"], name)
    print(fid, by[fid]["name"], "->", st)
    entry = {"status": st, "note": note}
    if by_paths:
        entry["by"] = by_paths
    status[fid] = entry


# --- Text display -------------------------------------------------------------------------------------------------------------

add("TXD-026", "Inline images in text", [
    "BUILT 2026-11-10 (lane GR): the vendored sanitiser keeps an <img> whose source is http(s) or a base64 data:image (a marked local change, docs/VENDOR.md; any other source is still its alt text); src/lib/text/prepare.ts makes a segment that is only an image the image centred, 67% of a column wider than 540px, with its alt text as a 14px caption under it (the image itself alt=\"\": axe image-redundant-alt); an inline image stays in the line, max 100% wide. Bilingual with an image on both sides shows the translation's only, the source column left empty (src/ui/Segment/Segment.tsx). Images load lazily (eager for a full-segment image). No live text with a full-segment image was found to compare against (Mishnat Eretz Yisrael, the original use, has none in the sections checked); built from static/js/ContentText.jsx and s2.css. Tests: src/lib/text/prepare.test.ts, src/ui/Segment/Segment.test.tsx, story Reader/TextSection ImagesInText.",
])
mark("TXD-026", "Inline images in text", "done", "Full-segment image with caption, inline images, the bilingual one-image rule (from legacy code; no live sample found)", "src/lib/text/prepare.ts, src/ui/Segment/Segment.tsx, src/ui/SegmentText/SegmentText.module.css, vendor/sefaria-toolkit/text-transform/normalize.ts")

add("TXD-023", "Inline category links in text", [
    "BUILT 2026-11-10 (lane GR): a.categoryLink[data-category-path] (the linker's CategoryMUTCSpan) is kept by the sanitiser (marked local change) and becomes <a class=category-link href=/texts/<path>> through libraryHref (this client's category pages; absolute on a host that does not serve them). Tests: src/lib/text/prepare.test.ts.",
])
mark("TXD-023", "Inline category links in text", "done", "Category mentions link to /texts/<path> (libraryHref)", "src/lib/text/prepare.ts, vendor/sefaria-toolkit/text-transform/normalize.ts")

add("TXD-020", "Allowed inline HTML in stored text", [
    "2026-11-10 (lane GR): images (TXD-026) and plain links are kept. A plain <a> with an http(s) or site-relative (/…, not //…) href stays a link (external ones rel=noopener noreferrer, same tab as legacy); javascript:, protocol-relative and other addresses are unwrapped. Tests: src/lib/text/prepare.test.ts.",
])
mark("TXD-020", "Allowed inline HTML in stored text", "done", "Formatting tags, footnotes, itags, overlays, images and plain links render", "src/lib/text/prepare.ts, src/ui/SegmentText/SegmentText.tsx, vendor/sefaria-toolkit/text-transform/normalize.ts")

add("TXD-045", "Segment numbers", [
    V + " (Genesis 1, Berakhot 2a; desktop 1280 and Pixel 7; English and Hebrew interface): the number is 12px whatever the reader's font size, Hebrew numerals in Heebo (.segmentNumberInner .he), Arabic in Roboto, weight 'lighter' (100). Here: 12px, Hebrew numerals now in Heebo (they fell back to a system face), weight 400 on purpose (the thin face is what support's most common complaint is about: verse numbers too small to read). A larger size is proposed in reports/gr-reader.md, not changed. Tests: e2e/verse-numbers.spec.ts.",
])

add("TXD-010", "Build numbered segments from text data", [
    "Fixed 2026-11-10 (lane GR, T-G05): a section whose numbering continues its parent's (index_offsets_by_depth) was numbered from 1: /Zohar,_Bereshit.2 showed 2:1, 2:2… where sefaria.org (" + V + ") shows 2:3, 2:4 (offset 2), and the refs were wrong too. normaliseTexts starts each segment section at 1 + its offset, per section across a range (old Sefaria.makeSegments / _get_offsets). Tests: src/lib/text/model.test.ts ('numbering offsets'), e2e/verse-numbers.spec.ts (Zohar). The book page's table of contents (BookPage.jsx:807 uses the depth-1 offset) is lane GS's.",
])

add("TXD-022", "Inline named-entity (topic) links in text", [
    "2026-11-10 (lane GR): the entity's href is /topics/<slug> through libraryHref (was the absolute www.sefaria.org address); the sidebar's Topics list, the dictionary's entity card and About's author and related-topic links likewise. Tests: src/lib/text/prepare.test.ts, e2e/connections.spec.ts, e2e/about.spec.ts.",
])

# --- Connections sidebar ------------------------------------------------------------------------------------------------------

add("CON-037", "Sidebar scroll position restore", [
    "BUILT 2026-11-10 (lane GR). " + V + ": Genesis 1:1, Commentary book list scrolled to 300 → Sforno opens at 0 → back to the list at 300; through Resources the place is forgotten (0). Here the same (src/features/reader/use-sidebar-scroll.ts); before, the panel body kept the last view's offset for every view (a text list opened mid-way). Tests: e2e/sidebar-scroll.spec.ts.",
])
mark("CON-037", "Sidebar scroll position restore", "done", "Book lists and Web Pages keep their place; text lists open at the top; Resources forgets (verified)", "src/features/reader/use-sidebar-scroll.ts, src/features/reader/ConnectionsPane.tsx")

add("CON-028", "Recent filters chips", [
    "Correction 2026-11-10 (lane GR, " + V + "): the loop bug only matters for an empty list; the recent filters do accumulate. Desktop 1280: Commentary → Rashi shows 'Rashi' above the list (in the body, 48px); back → Ramban shows 'Ramban Rashi' (newest first, the current one with its 4px category rule, chips 18px serif, margin 6px 14px 6px 0). Phone (Pixel 7): none on load; after the same in-app path the set is in the header instead (CON-002).",
    "BUILT 2026-11-10 (desktop): with more than one filter used the names replace the title above the list, newest first, the current one marked (aria-current) with its rule; a recent one's link switches without reordering (setConnectionsFilter updateRecent=false). Tests: e2e/recent-filters.spec.ts. The phone header placement is CON-002 (not built).",
])
mark("CON-028", "Recent filters chips", "partial", "Desktop recent-filter set built and verified; the phone header placement (CON-002) not built", "src/ui/ConnectionsPanel/TextList.tsx, src/features/reader/ConnectionsPane.tsx")

add("CON-002", "Connections header mobile variant", [
    V + " (Pixel 7, English and Hebrew interface): the header's category-colour top border is set but 0px wide (invisible); Resources' title is centred (justify-content: center); after Resources → Commentary → Rashi in the app the recent filters sit in the header ('Rashi', then 'Ramban Rashi') with no title in the body; on a fresh load of with=Rashi neither shows. Not built in wave 2.",
])

mark("CON-002", "Connections header mobile variant", "partial", "Resources title centred at phone width (verified); recent filters in the phone header not built", "src/ui/ConnectionsPanel/ConnectionsPanel.module.css")

add("TXD-062", "Print stylesheet for text", [
    "2026-11-10 (lane GR): as legacy static/css/s2-print.css (linked media=print on reader pages): the site header, the sidebar, the text header's buttons, the connection dots and footnote markers/itags are hidden; segment numbers are printed (they were hidden here). The live reader has no print footer. Still to do (lane R's TextColumn): the text column is a fixed-height scroll box, so printing shows only what is on screen; legacy sets the reader's heights to auto. Tests: e2e/print.spec.ts.",
])
mark("TXD-062", "Print stylesheet for text", "partial", "Legacy print rules ported; the text column's fixed-height scroll box still cuts the printout (TextColumn, lane R)", "src/ui/Segment/Segment.module.css, src/ui/SegmentText/SegmentText.module.css, src/ui/ConnectionsPanel/ConnectionsPanel.module.css, src/ui/ReaderControls/ReaderControls.module.css, src/ui/SiteHeader/SiteHeader.module.css")
add("PLT-030", "Print stylesheets", [
    "2026-11-10 (lane GR): see TXD-062. Header, sidebar, reader buttons, dots and footnote markers hidden in print; the cookie notice already was. The live reader has no Sefaria print footer (#printFooter exists only in gdocs_sheet.html, commented out), so none is added. Banners (SiteWideBanner) and the text column's height remain.",
])
mark("PLT-030", "Print stylesheets", "partial", "Legacy's print hiding ported; banners and the text column's fixed height remain", "src/ui/*/**.module.css (@media print)")

add("SHL-051", "Connection filter state management", [
    "2026-11-10 (lane GR): recent filters (CON-028, desktop) and the sidebar scroll memory (CON-037) built.",
])
mark("SHL-051", "Connection filter state management", "partial", "Filter, views, recent filters and scroll memory built; the phone header placement of recent filters (CON-002) not", "src/lib/connections/url.ts, src/features/reader/ConnectionsPane.tsx, src/features/reader/use-sidebar-scroll.ts")

add("CON-014", "Resources list (sheets, web pages, topics, manuscripts, readings)", [
    "2026-11-10 (lane GR, T-G04): signed in, the Sheets count adds the reader's own sheets on the verses (private too) from /api/related/<ref>?private=1, their public ones counted once (old Sefaria.sheets.sheetsTotalCount); adding to a sheet refreshes it. Tests: src/lib/connections/related.test.ts.",
])

add("CON-056", "Add to sheet: version and partial-selection handling", [
    "BUILT 2026-11-10 (lane GR, T-G04): words selected in the text (one language shown) cut the source's text: the first verse from the selection, the last to it, '...' where cut, formatted as the old segmentsToSourceText (numbers except Talmud and the Haggadah, paragraphs except Tanakh and Talmud), posted as the side's text with the refs and versions. Deliberate difference: inside one verse both ends are cut (the old code's end branch is an `else if` after the first segment's, and its start match needs the selection to run to the verse's end, so it added the whole verse). The image guard: a verse that is only an image is not added ('We do not currently support adding images to source sheets.' in the view instead of an alert; old checkContentForImages). Signed-in only: not checkable on sefaria.org without an account; built from static/js/AddToSourceSheet.jsx and sheetsUtils.js. Tests: src/lib/text/sheet-source.test.ts, src/features/reader/use-last-selection.test.tsx.",
])
mark("CON-056", "Add to sheet: version and partial-selection handling", "done", "Versions, selected-words trimming and the image guard built (unit-tested)", "src/lib/text/sheet-source.ts, src/features/reader/use-last-selection.ts, src/features/reader/ConnectionsPane.tsx, src/lib/user/sheets.ts")
mark("CON-034", "Add connection to sheet button", "done", "Add to Sheet (with selected-words trimming, CON-056) and on each connected text", "src/ui/AddToSheetView, src/features/reader/ConnectionsPane.tsx")

add("CON-057", "Google Docs extension promo in Add to Sheet", [
    "BUILT 2026-11-10 (lane GR): the box under Add to Sheet's button (old GDocAdvertBox: 'Add texts directly to your Google Docs with our new extension! Learn more' and Install Now with the old utm parameters), promo_viewed once on screen and promo_clicked for campaign GDocs_Promo_AddToSheet, adType sidebar; Install Now sets gdoc_installed, which hides it. Signed-in only. Tests: src/ui/AddToSheetView/AddToSheetView.test.tsx; story WithGoogleDocsPromo.",
])
mark("CON-057", "Google Docs extension promo in Add to Sheet", "done", "GDocAdvertBox ported (impression, click, gdoc_installed)", "src/ui/AddToSheetView/GDocAdvert.tsx, src/features/reader/ConnectionsPane.tsx")
mark("PRM-009", "Google Docs add-on promo", "done", "Same as CON-057", "src/ui/AddToSheetView/GDocAdvert.tsx")

# --- Versions -----------------------------------------------------------------------------------------------------------------

add("VER-010", "Translation preview with truncation", [
    "BUILT 2026-11-10 (lane GR). " + V + " (Genesis 1:1-5, Translations): previews are cut at 110px (5 lines × 22px); 44 of 47 were cut; a '…' (18px, black, inline under the preview) shows the whole preview (253px) without changing the address. Here the same (was a 7.5em CSS cut without the '…'). Tests: e2e/versions.spec.ts.",
])
mark("VER-010", "Translation preview with truncation", "done", "Five-line cut with the clickable … (verified)", "src/ui/TranslationsView/TranslationsView.tsx")

add("VER-013", "Translation Open sub-mode", [
    "2026-11-10 (lane GR): signed in, Add to Sheet beside Open adds the passage in that translation only (the old VersionsTextList passes versions {[language]: title}); its back link returns to the preview. Tests: src/ui/TranslationsView/TranslationOpenView.test.tsx.",
])
mark("VER-013", "Translation Open sub-mode", "done", "Preview, Open, back and Add to Sheet built", "src/ui/TranslationsView/TranslationOpenView.tsx, src/features/reader/ConnectionsPane.tsx")

# --- User library (T-G04) -----------------------------------------------------------------------------------------------------

add("USL-008", "Saved items and reading history pages", [
    "2026-11-10 (lane GR, T-G04): each text and sheet on /saved and /history has its Save button (old SaveLine: after the title, before the time stamp; shown on hover, always on touch screens and while focused), filled while saved; a click removes or saves it again with the item's versions. The language toggle (old LanguageToggleButton beside the title, desktop English interface) is not built. Tests: src/features/user-history/UserHistoryRoute.test.tsx, src/ui/UserHistoryPage/UserHistoryPage.test.tsx.",
])
mark("USL-008", "Saved items and reading history pages", "partial", "Saved and History pages with per-item Save; the language toggle not built", "src/routes/saved.tsx, src/routes/history.tsx, src/features/user-history, src/ui/UserHistoryPage")

add("USL-004", "Note listing with delete and sheet-aware links", [
    "2026-11-10 (lane GR, T-G04): 'Add to Sheet on a note' has no way in on sefaria.org: static/js/NoteListing.jsx (the live /texts/notes list) keeps the modal state but renders no button that opens it; the button exists only in static/js/MyNotesPanel.jsx, which nothing imports. Parity is none; not built.",
])
mark("USL-004", "Note listing with delete and sheet-aware links", "done", "Listing with delete and sheet-aware links; legacy's note Add to Sheet is unreachable (dead code), not ported", "src/ui/UserHistoryPage, src/features/user-history")

# --- T-G05 checks that needed no change ---------------------------------------------------------------------------------------

add("VER-008", "Download versions from About", [
    "Re-checked 2026-11-10 (lane GR, T-G05): only versions whose licence does not start with 'Copyright' are offered (old isVersionPublicDomain); src/ui/DownloadVersions/DownloadVersions.test.tsx.",
])
add("TXT-020", "Liturgy (Siddur) text treatment", [
    V + " (T-G05, Siddur Ashkenaz, Modeh Ani, desktop and Pixel 7): the display menu offers Source / Translation / Source with Translation, the layouts and font size, and Vowels only (no cantillation, aliyot or punctuation); the same here (displayMenuAvailability).",
])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
