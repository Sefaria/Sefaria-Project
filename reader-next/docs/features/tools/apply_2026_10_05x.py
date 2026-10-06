"""Header autocomplete and the Sources search page, verified 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SRC-046", [
    "VERIFIED /search?q=light&tab=text&search_tab=sources&tvar=1&tsort=relevance: tabs 'Sources 10,000+ | Books 1 | Authors 1 | Topics 21', toggle 'All Results | Exact Phrase', sort 'Relevance', cards 'Genesis 1:3 … 12 more versions', Filters module with 'Find a filter' and Tanakh (824), Mishnah (175)… ",
    "Request: POST /api/search-wrapper/es8 (sent as text/plain to avoid a CORS preflight), 100 hits a page; body fields naive_lemmatizer (all) / exact (exact phrase), slop 10 / 0; relevance sort = score + pagesheetrank (missing 0.04), chronological = comp_date,order. A second unfiltered size-0 request carries the 'path' aggregation for the filter tree; entity counts come from GET /api/entity-search?type=book|author|topic.",
])
add("SRC-040", ["Parameters read by the rebuild: q, tab (text), search_tab, tvar (1 all / 0 exact), tsort (relevance | chronological), tpathFilters (A|B). Gershayim in the query repaired before it is sent."])
add("SRC-042", ["Rebuild: a new query, tab, exact toggle, sort or filter is a new history entry; back restores the previous search from the address alone."])
add("SRC-061", ["Rebuild: IntersectionObserver sentinel 300px before the end; further pages start at the number of hits already loaded, up to the total; entity tabs page the same way (cap 10,000)."])
add("SRC-001", ["Rebuild: header combobox, 100 ms debounce, aborts the previous request, at least 3 characters; GET /api/name/<q>?type=Topic&type=ref&type=TocCategory&type=Term&topic_pool=library; groups in the old reversed order (Authors, Topics, Categories, Books) after the 'Search for …' row; submit resolves a ref, topic (external), category or the search page."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
for k in ("SRC-039","SRC-040","SRC-042","SRC-046","SRC-048","SRC-051","SRC-052","SRC-053","SRC-054","SRC-055","SRC-057","SRC-061","SRC-064","SRC-066","SRC-085"):
    st[k] = {"status": "done", "by": "src/features/search/SearchRoute.tsx, src/lib/search/search-page.ts, src/ui/SearchPage"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
