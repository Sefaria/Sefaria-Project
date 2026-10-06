"""Search bookkeeping 2026-10-05: server-only / dead / old-bug entries get a status; Hebrew filter-box gap noted. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
S = T / "rebuild-status.json"; st = json.load(open(S))
def mark(ids, status, note):
    for i in ids: st[i] = {"status": status, "note": note}
mark([f"SRC-{n:03d}" for n in (31,32,33,34,35,36,37,38,73,74,75,76,78,81,82)], "n/a", "Server behaviour; the client calls this API (name, entity-search, search-wrapper, OpenSearch).")
mark(["SRC-059", "SRC-077", "SRC-103"], "n/a", "Dead in the old site (qh param, topic cards query) or a list of things search never had; not rebuilt.")
mark(["SRC-101", "SRC-102"], "n/a", "Garden visualization / kNN API: not part of the reader.")
mark(["SRC-014"], "replaced", "Old-site crash on exact Collection/Category Enter; the rebuild navigates to the category/collection normally.")
mark(["SRC-087"], "partial", "Old bug (Hebrew text matches everything) not ported; but the box matches only English titles — should also match Hebrew titles.")
mark(["SRC-025", "SRC-026"], "deferred", "Needs Compare Text, which is not built.")
mark(["SRC-027", "SRC-088", "SRC-089", "SRC-090", "SRC-091", "SRC-092", "SRC-093", "SRC-098", "SRC-099", "SRC-100"], "deferred", "Collections / Voices / topics: Phase 7, owner decides.")
mark(["SRC-104", "SRC-105", "SRC-106", "SRC-107", "SRC-108"], "deferred", "Analytics would send data to Sefaria: ask the owner.")
mark(["SRC-028", "SRC-029", "SRC-030"], "deferred", "OpenSearch / sitelinks / legacy s1 handoff need server or deploy decisions: ask the owner.")
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
for fid, line in [("SRC-048", "Rebuild deviation (accessibility): the count pills and the sort button use #595959 on the grey (#ededec) instead of the live #707070 (contrast 4.2:1, below the 4.5:1 AA minimum).")]:
    if line not in by[fid]["details"]: by[fid]["details"].append(line)
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
for fid, lines in [
  ("SRC-058", ["Rebuild: words from the hit's highlight (highlightsOf) travel in router history state ({nav:'go', terms}), not the URL; the verse the result names wraps them in span.queryTextHighlight (pale blue #D2DCFF from s2.css). Matching ignores case, Hebrew vowels/cantillation, and tags between words (src/lib/text/highlight-terms.ts). Cleared by the next scroll-driven history update, a reload, or any other navigation.",
                "Rebuild deviation: the blue padding is a box-shadow so removing the highlight never re-wraps the line (reading must not jump). Applies to both the search page and the sidebar search."]),
  ("TXT-027", ["Rebuild: done for the search page and the sidebar 'search in this text' (SRC-058); e2e/search-page.spec.ts."])]:
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-068", ["VERIFIED 2026-10-05 (sefaria.org desktop): the entity sort is a dropdown 'Sort by <label>' with a tick on the chosen option; the choice is NOT in the URL (tsort stays relevance) and a change sends GET /api/entity-search?…&sort=alpha for that tab only. Labels: Books 'Relevance | Composition Date (Oldest First) | Composition Date (Newest First) | A-Z'; Authors 'Year (Oldest First) | Year (Newest First)'; Topics 'Relevance | A-Z'. Hebrew: תאריך חיבור (ישן לחדש), שנה (ישן לחדש), א-ת. Sort and filters are kept in page state and reset with a new query."])
add("SRC-069", ["VERIFIED 2026-10-05: ticking Halakhah on the Books tab sends GET /api/entity-search?q=rashi&type=book&start=0&sort=relevance&filter=Halakhah (one `filter` per applied path); the URL does not change. The Books badge then shows the FILTERED total (10 → 4), the other badges stay. Counts per category come from the unfiltered response's categoryCounts. No filters on Authors/Topics."])
add("SRC-070", ["VERIFIED: topic card = round # icon, black accent bar, parent-category crumb above the name (e.g. 'Nature' above 'Light'; none for 'Lighting'), name, description. Rebuild: crumb NOT built (needs the topic TOC, with the topics pages — Phase 7)."])
add("SRC-072", ["VERIFIED: book card = round book icon coloured by category + category-coloured bar, crumbs 'Halakhah › Rishonim' (links to /texts/<path>) above the name, then '1115 CE · Rashi' (author linked to the topic page), then the description. Rows the server makes up for a category/author carry their own url; the crumb is then their categoryLabel."])
add("SRC-071", ["VERIFIED: author card = round pen icon, name '(Maharal)' form, lifespan '1520 – 1609 CE', description."])
add("SRC-066", ["VERIFIED: opening the Topics tab directly also fires the three entity-search GETs and the search-wrapper POST (for the Sources badge)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["SRC-070"] = {"status": "partial", "note": "Card built; the parent-topic crumb needs the topic TOC (topics pages, Phase 7)."}
for k in ("SRC-068", "SRC-069", "SRC-071", "SRC-072"): st.pop(k, None)
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-049", ["VERIFIED 2026-10-05 at 390px: in-page search box under the header, tab strip, one filter icon button (40×40, right) under the tabs, cards full width; no sidebar, no toggle/sort row. Rebuild: the phone layout starts at max-width 985px (useMediaQuery; the first render is the desktop one, as on the old page) and the sidebar is dropped."])
add("SRC-063", ["VERIFIED: panel headings Filters (Sources) / Filter (Books) / Sort (Authors, Topics); Sources sections 'Search Type' (the toggle full width), 'Sort by' (radios Relevance / Chronological), 'Filters' (Find a filter box + the categories); Books 'Sort by' (Relevance, Composition Date (Oldest/Newest First), A-Z) + Filters; Authors 'Year (Oldest/Newest First)'; Topics Relevance / A-Z. 'Show Results' closes it. Rebuild deviation: the Show Results button is fixed at the bottom of the panel instead of after the last filter (4,700px down on the live panel)."])
add("SRC-062", ["Rebuild: a tablist of buttons (role=tab, aria-selected); the edge fades appear only on the side where more tabs are hidden; the active tab is scrolled into view inside the strip only."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-082", ["VERIFIED 2026-10-05 (scripts/parity-search.mjs): for the Hebrew query אור with 'All Results' sefaria.org shows 10,182+ sources, Tanakh (182) and Genesis 1:14 first — Dicta's Tanakh hits replace Sefaria's (the Sefaria API alone gives 10,000+, Tanakh (233), Genesis 1:3 first). The page's single search-wrapper POST (aggs ['path'] + 100 hits together) is unchanged; the Dicta calls go to another host.",
             "Rebuild: NOT built — it would send the user's Hebrew query to dicta.org.il, a third party. Owner decision needed. Until then Hebrew 'All Results' is Sefaria's own Tanakh hits (the old client's fallback when Dicta fails). Exact Phrase is identical to live."])
add("SRC-083", ["VERIFIED: the filter tree's order comes from the catalog with `searchRoot` rewrites (old _cacheFromToc / compareSearchCatPaths): categories carrying searchRoot (Targum; the Rishonim/Acharonim/Modern commentaries on Tanakh, Mishnah, Talmud) are listed after Reference as 'Targum', 'Tanakh Commentary', 'Mishnah Commentary', 'Talmud Commentary', ordered by [100, position in the catalog]. The rebuild first dropped them (they are not catalog top categories) — found by the parity script."])
add("SRC-043", ["VERIFIED: the live search page has no footer links under the Filters module (the nav sidebar's footer is not rendered there). Rebuild matched."])
add("SRC-064", ["VERIFIED per tab: illustration (NoResults{Source,Books,Authors,Topics}.svg, 140px), serif heading 'No <sources|books|authors|topics> found for “q”', body (Sources adds 'change your filter/toggle selections'), a blue button (Browse Library → /texts; Browse Authors → /people; Browse Topics → /topics) and 'Something seems wrong? Report a bug or contact us.' (bug form sefaria.formstack.com/forms/bug_report; Hebrew form …/hebrew_bugs). The sort dropdown still shows on the entity tabs. Illustrations copied to public/img/no-results/."])
add("SRC-072", ["VERIFIED: the whole card is a link (click anywhere); description clamped to 4 lines, hidden on Books cards at ≤600px; category rows (isCategory) use the stacked-layers 'collection' icon; the crumbs are one line and collapse to 'first › … › last' when they do not fit. Rebuild: all built (crumb collapse by measuring)."])
add("SRC-049", ["VERIFIED: sefaria.org decides single-panel mode from the User-Agent AND the width. A desktop browser squeezed to 390px keeps the desktop-style Books toolbar (sort dropdown, no filter button) with the strip tabs; a phone UA gets the filter button on every tab. Rebuild decides by width only (≤985px) — one behaviour, the phone one."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["SRC-082"] = {"status": "deferred", "note": "Sends the Hebrew query to dicta.org.il (third party): owner decision. Hebrew 'All Results' uses Sefaria's own Tanakh hits meanwhile."}
for k in ("SRC-064", "SRC-043", "SRC-083"): st.pop(k, None)
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-017", ["VERIFIED 2026-10-05 on sefaria.org (English interface, desktop): focusing the HEADER box shows a keyboard icon at its end; it opens a keyboard under the box (Hebrew by default: rows ~1234…, Tab/qwerty row קראטוןםפ, Caps שדגכעיחלךף, Shift זסבהנמצתץ, space + AltGr; a layout menu with ~90 languages). The big box on the results page has NO keyboard (its class lacks keyboardInput). Keys type at the caret, Shift/AltGr apply to one key.",
             "Rebuild: Hebrew layout only (from the old VKI table, BSD) in VirtualKeyboard + KeyboardLauncher; header box only, English interface, not on phones. The ~90-layout menu is not built — recorded as a deliberate scope limit (Hebrew is the point of the feature)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-021", ["VERIFIED 2026-10-05: GET /api/words/completion/אור → [[headword, form], …] (10): across dictionaries form == headword ('אור','אורא','אורב'…); in Jastrow ('/api/words/completion/אור/Jastrow Dictionary') forms are vowelled ('אוֹר','אוּר I','אוֹר I','אור II'…). Choosing a completion or pressing Enter sends the FORM (Enter: the first completion's form, else the raw text). Rebuild: DictionarySearch (combobox + listbox, 100ms debounce, cached through the library cache), Latin letters → 'Invalid entry.  Please type a Hebrew word.', Hebrew keyboard icon in the English interface. The old box polled the input every 330 ms for keyboard typing; the rebuild reacts to input directly."])
add("SRC-022", ["VERIFIED: the book page of a dictionary (/Jastrow: 'Jastrow / REFERENCE / Start Reading / Contents | Versions / Search Dictionary / Browse By Letter אבגד…') has the box between the tabs and the letter strip (input class 'search keyboardInput ui-autocomplete-input', placeholder 'Search Dictionary'). Rebuild: same place; picking an entry opens '<Title>, <word>' only after the entry is fetched OK (else nothing)."])
add("SRC-020", ["Rebuild: in the reader, the Table of Contents sidebar of a dictionary book gets the box above its contents, and 'Search in this text' IS the dictionary box (not the text search); choosing opens the entry in the sidebar's own panel (onGoToRef)."])
add("RTE-026", ["FOUND 2026-10-05: client-side navigation to a title with a comma wrote %2C (TanStack encodes path params); the old site and a direct load keep the comma ('/Jastrow,_אוֹר', '/Mishneh_Torah,_Shabbat.1.1'). Fixed with `pathParamsAllowedCharacters: [',', ':', '@']` in src/router.tsx."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
for k in ("SRC-020", "SRC-021", "SRC-022"): st.pop(k, None)
st["SRC-094"] = {"status": "done", "note": "Box, results, paging, query in URL, Hebrew keyboard, dictionary box for dictionary books. Not copied: remembering the query in memory after leaving the view (the address carries it).", "by": "src/ui/SidebarSearch, src/lib/search/text-search.ts, src/ui/DictionarySearch"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-044", ["Rebuild: no mutators — the address is the state (q, tab, tvar, tsort, tpathFilters); a change is a new history entry (SearchRoute `go`), the aggregations come from a query of their own so there is no `filtersValid` flag, and the two-phase race of the old client cannot happen."])
add("SRC-050", ["Rebuild: 4 tab blocks, 1 sort block and 11 cards of shimmer replace the tabs, toolbar and list while the first Sources query runs (client-side searches; a server-rendered page arrives with its results); a visually hidden 'Searching...' status for assistive technology."])
add("SRC-060", ["Rebuild: an :active style on touch devices (@media (hover: none)); the old 100 ms / 150 ms / 10 px timing in JavaScript is not copied — browsers already hold :active back while a touch might be a scroll."])
add("SRC-065", ["Rebuild deviation (fixes the old bugs): a failed search says 'Something went wrong with the search.' with Try again (Sources and the entity tabs); a failed next page keeps what is shown and offers Try again; never 'No sources found'."])
add("SRC-087", ["Rebuild: the filter box matches Hebrew titles too (vowels ignored) instead of matching everything."])
add("SRC-109", ["Rebuild: every search request goes through TanStack Query with the `search` policy (5 min fresh, 30 min kept, not persisted): results pages, the aggregation query, entity searches, name suggestions and dictionary completions; the same request twice asks once."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["SRC-060"] = {"status": "done", "note": ":active on touch devices", "by": "src/ui/SearchPage"}
st["SRC-087"] = {"status": "done", "note": "Hebrew titles match; old bug not ported", "by": "src/lib/search/search-page.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
