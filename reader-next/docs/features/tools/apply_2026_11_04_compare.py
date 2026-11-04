"""The version-diff tool (/compare): survey of the legacy page and the live site, and its port. Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["LEG-010", "RTE-019", "SHL-037", "SHL-038", "CON-066", "LIB-003", "LIB-018", "BOK-004", "SRC-025"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)

NEW = [
    {"id": "LEG-031", "area": "legacy-pages", "group": "Version Compare", "name": "Version diff page frame (standalone document)",
     "summary": "The version-diff page is a document of its own: no site header or stylesheet, the browser's default styles, English words in both interface languages.",
     "details": [
         "templates/compare.html: <title>Compare</title>, no viewport meta (a phone lays it out 980px wide), <html lang> = interface language with no dir (left-to-right in the Hebrew interface too), body in the browser's defaults (Times 16px, 8px margin), Google Tag Manager only (no gtag config, no Simple Analytics, no cookie notice, no header). No data-anl-* attributes and no GA4 events of its own.",
         "Own CSS: td padding 8px, border 1px #ddd, td:hover #ccffff; td.he rtl/right, td.en ltr/left; span.ins #5CEE5C; span.del rgba(193,66,66,.5); span.filtered no background; span.change tooltip (#555 on lightblue 2px border, white text, padding 10px); div.changeDialog (#ccc).",
         "compare.html also loads React 15.6.1, jQuery 2.2.4 and jQuery UI from cdnjs; only jQuery is used (the filter button). The page itself is diffPage.js built with the site's React.",
         "VERIFIED 2026-11-04 on www.sefaria.org (English and Hebrew interface, desktop 1280 and phone User-Agent).",
     ], "audience": "staff", "platform": "all", "status": "legacy", "tier": "optional", "refs": ["templates/compare.html"], "src": "survey 2026-11-04"},
    {"id": "LEG-032", "area": "legacy-pages", "group": "Version Compare", "name": "Version diff: which sections a ref shows",
     "summary": "The ref in a /compare address is turned into the section(s) diffed: a book its first section, a segment its section, a ref above section level one table per section below it.",
     "details": [
         "sefaria/views.py compare: Ref.is_ref(comp_ref) else secRef ''; secRef = first_available_section_ref (raised to its section when a segment); a book-level ref → one table of its first section; a ref neither section nor book level → refArray = all_subrefs (Rashi on Genesis 1 → 31 tables 'Rashi on Genesis 1:1'…'1:31').",
         "A segment (Genesis 1:3): refArray [] — the form shows 'Genesis 1' and NO table (an empty array is truthy in the page). VERIFIED 2026-11-04.",
         "BUG: a segment range (Genesis 1:3-5) answers 500 (all_subrefs of a ranged segment throws). VERIFIED 2026-11-04.",
         "BUG: a section range (Genesis 1-2) stays secRef 'Genesis 1-2'; its table has max(sections) rows 'Genesis 1-2:1'… that never leave 'Loading...'. VERIFIED 2026-11-04.",
         "'Load Next Chapter' (Sefaria.getRef(secRef).next) goes to /compare/<next>/<lang>/<v1>/<v2> with the page's own address parts; with no language in the address the path ends '//' and Django answers 404 (e.g. from /compare/Genesis.1/).",
         "Tables appear only when the address has language, v1 and v2; an invalid ref with all three shows 'Loading Text...' for ever.",
     ], "audience": "staff", "platform": "all", "status": "legacy", "tier": "optional", "refs": ["sefaria/views.py:2245", "static/js/diff_page.jsx:107"], "src": "survey 2026-11-04"},
]
for n in NEW:
    if n["id"] not in by:
        atlas.append(n); by[n["id"]] = n
    print(n["id"], n["name"])

add("LEG-010", [
    "Correction (survey 2026-11-04): the page is public, but the client opens the change dialog only for Sefaria.is_moderator || Sefaria.is_editor; others get alert('Only Sefaria Moderators Can Edit Texts') or, signed out, alert('Not signed in. You must be signed in as a Sefaria Moderator to use this feature.'). The write (POST /api/texts/<segment url>, form field json={versionTitle, language, text}) is checked by the server.",
    "Form: 'Ref:' text input (300px), 'Language:' Hebrew/English, and — only when the typed ref has versions — 'Version 1:'/'Version 2:' selects ('Select a Version' + the titles of the language bucket of /api/texts/versions/<ref>: a title ending [xx] is language xx). The version lists follow the typed ref and the chosen language live. 'Load Diff' goes to /compare/<ref>/<lang>/<v1>/<v2> (spaces → underscores) only when something differs from the page's address. VERIFIED 2026-11-04.",
    "Texts: old /api/texts with vhe/ven=<title with underscores>, wrapLinks=0, stripItags=0, firstAvailableRef=1, fallbackOnDefaultVersion=1 — first the section of each version (row count = the longer), then every segment of both versions again (2 + 2N requests per table).",
    "Diff quirks kept: diff-match-patch with its default 1s limit (its half-match pass decides which of equal-cost diffs is shown; Genesis 1:7 Masorah vs Ta'amei); an insertion before the last character is red (not applicable) because ValidateDiff reads mapping[at+1] past the end; HTML entities show literally (&thinsp;, &nbsp;) since the raw text is rendered as text. VERIFIED 2026-11-04.",
    "Filters: the seven checkboxes act only on 'Update', hiding the colour of ins/del spans whose whole text is that character (only spans already rendered).",
    "BUG: accepting an insertion at the very end of a segment computes a NaN position and writes the replacement in front of the whole text. BUG: after a failed post the row stays blocked ('Another Change in Progress, Please Wait') until reload.",
    "BUILT 2026-11-04 (src/routes/compare.$.tsx + compare.index.tsx, src/features/compare, src/ui/VersionDiff, src/lib/compare): same page, address, form, tables, filters, tooltip and dialog; pixel diff 0.00% against www.sefaria.org at 1280 and on a phone, English and Hebrew interface (empty form, ref only, Genesis 1 he diff, English diff, Talmud, book-level). Differences on purpose: one texts request per section and version (segments taken from it, same text); a section range shows one table per section, a segment range the form without a table (no 500); an end-of-text insertion is applied at the end; a failed post can be retried; the dialog opens for is_staff (the client cannot see the Editors group: an editor who is not staff gets the moderators-only alert); the moderator check asks the session at the click. e2e/compare.spec.ts.",
])
add("RTE-019", [
    "Survey 2026-11-04 (the view is at sefaria/views.py:2245 on reader-next, 2196 on master). The pattern is matched on the decoded path, so: /compare/Genesis.1 (no slash) makes 'Genesis.1' the SECOND VERSION and shows an empty form; /compare/Genesis.1/ is the ref; /compare/X/he names v2='he'; an escaped %2F splits; every '_' in a version reads as a space. VERIFIED 2026-11-04 (JSON_PROPS on www.sefaria.org).",
    "BUILT 2026-11-04: src/lib/compare/url.ts reads and writes it byte for byte; the router keeps trailing slashes (trailingSlash 'preserve') and the server's slash redirect skips /compare/; 'compare' left DJANGO_PREFIXES on the Library host — on the Voices host it still passes through to Django (LIBRARY_HOST_ONLY_PREFIXES, Q-E1). A path the pattern cannot match is our 404, which Django answers in the cluster.",
])
for i in ["SHL-037", "SHL-038", "CON-066", "LIB-003", "LIB-018", "BOK-004", "SRC-025"]:
    add(i, ["Not the /compare page: this is the in-reader compare panel (a second text chosen through the library from the sidebar's Compare Text tool). The /compare URL is the version-diff tool, LEG-010/RTE-019/LEG-031/LEG-032 (survey 2026-11-04). Not ported by the 2026-11-04 compare lane."])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["LEG-010"] = {"status": "partial", "note": "Page, form, diff tables, filters, Apply Change ported at pixel parity; the Editors group (non-staff editors) is not recognised", "by": "src/features/compare/ComparePage.tsx"}
st["RTE-019"] = {"status": "done", "by": "src/lib/compare/url.ts"}
st["LEG-031"] = {"status": "done", "by": "src/lib/routing/standalone.ts"}
st["LEG-032"] = {"status": "done", "note": "segment ranges and section ranges handled sensibly (legacy 500 / endless loading)", "by": "src/lib/compare/queries.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
