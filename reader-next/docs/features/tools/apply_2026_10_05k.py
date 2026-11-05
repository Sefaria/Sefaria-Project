"""Sidebar search, verified on www.sefaria.org 2026-10-05, plus probe observations not logged earlier. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-094", [
    "VERIFIED 2026-10-05 (Genesis): URL load with sbsq=light sends THREE POSTs to /api/search-wrapper/es8 — (1) filters [] with aggs ['path'], (2) filters [''] (the path not yet known), (3) filters ['Tanakh/Torah/Genesis'] — only the last is shown. Typing a new query repeats the same three. Body of the last: field naive_lemmatizer, filter_fields ['path'], size 100, slop 10, sort_fields ['comp_date','order'], source_proj true, type text; no `start` on the first page.",
    "CORRECTION: the atlas said Hebrew queries are 'Dicta-merged' — the request for a Hebrew query is identical in shape (query: the Hebrew word as typed); nothing is merged client-side. Not ported.",
    "VERIFIED strings: placeholder and title 'Search in this text' / 'חפש בטקסט'; empty result '0 results.' / '0 תוצאות.'; results text for 'light' (112 hits) and the empty query identical to the rebuild's.",
    "LIVE QUIRK: the live panel can sit on a stale '0 results.' for several seconds after load (the intermediate unfiltered/empty-path queries resolve first); a URL-loaded Hebrew query only showed its results after ~10 s.",
    "REBUILD FACT (CORS): the search endpoint answers a browser POST from another origin only if it is a 'simple' request — content-type: application/json fails the preflight (Access-Control-Allow-Headers lacks content-type), content-type: text/plain works and the server still parses the JSON body. Same-origin on sefaria.org hides this. The rebuild sends text/plain and waits for the path filter, so only the final query runs.",
    "NOT YET REBUILT: Hebrew virtual keyboard (VKI) on the box; DictionarySearch instead of the box for dictionary books; remembering the query when returning to the view; next-page loading is implemented (start = hits loaded) but was not observed on the live site (112 hits, size 100: no second request appeared in a scroll probe).",
])
add("SRC-095", ["VERIFIED 2026-10-05: first panel &sbsq=<query> (sbsq=zzzxqkw seen after typing); the rebuild also reads/writes sbsq2… per panel (test in workspace.test.ts). The URL with a Hebrew query loads and runs it."])
add("SRC-096", [
    "VERIFIED 2026-10-05: result = ref link (Hebrew ref in a Hebrew interface), snippet with <b> matches in a colour bar, version name, 'N more version(s)' / 'N גרסאות נוספות' toggle; merging by ref with version_priority ascending (e.g. Genesis 1:3 'אור': Miqra according to the Masorah leads, three more beneath); hit ids repeated by the index are dropped. Text identical to the rebuild for 'light' and the empty query.",
    "Click: the owning panel goes to the ref in the hit's version and the sidebar stays on the results (rebuild: ven/vhe set from isPrimary). The href of a result link carries ?v<lang>=<version>&qh=<query> on the old site; qh is dead (SRC-059), the rebuild's href has the version only.",
])
add("SRC-097", ["VERIFIED 2026-10-05: GET /api/search-path-filter/Genesis returns a bare JSON string \"Tanakh/Torah/Genesis\"."])
add("SRC-059", ["Consistent with the sidebar search finding: the result links still carry qh; highlighting comes from textHighlights in state, not the URL."])
add("PRM-001", ["PROBE NOTE 2026-10-05: on www.sefaria.org the interrupting overlay (#interruptingMessageOverlay) intercepts pointer events and blocks automated clicks on the page behind it; probes must remove it. Rebuild: no interrupting messages yet."])
add("RTE-059", ["PROBE NOTE 2026-10-05: an automated visit to www.sefaria.org from this machine was redirected to www.sefaria.org.il with a Hebrew interface (geo/language domain redirect); set the interfaceLang=english cookie for www.sefaria.org to keep English."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["SRC-094"] = {"status": "partial", "note": "Box, results, paging, query in URL done; keyboard, dictionary box, remembered query not", "by": "src/ui/SidebarSearch, src/lib/search/text-search.ts"}
st["SRC-095"] = {"status": "done", "note": "sbsq / sbsqN read and written", "by": "src/lib/workspace/url.ts"}
st["SRC-096"] = {"status": "done", "note": "Results and click verified; qh dead and not ported", "by": "src/ui/SidebarSearch/SidebarSearch.tsx"}
st["SRC-097"] = {"status": "done", "by": "src/lib/search/text-search.ts"}
st["CON-013"] = {**st.get("CON-013", {}), "status": "done", "note": "About, Translations, Table of Contents and Search in this Text work"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
