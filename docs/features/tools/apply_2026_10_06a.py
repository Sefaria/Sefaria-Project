"""Owner decisions 2026-10-06: fonts from the legacy site; Dicta merge. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("TXD-060", [
  "OWNER DECISION 2026-10-06: use the legacy site's fonts. FOUND: the rebuild's stack already listed the old order ('Cardo', 'Meltho', 'adobe-garamond-pro', 'Crimson Text'…), but on sefaria.org Cardo is declared ONLY for Greek and combining marks (static/css/font-faces.css unicode-range U+0300-036F, U+0370-03FF, U+1D00-1D7F, U+1DBF, U+1F00-1FFF, U+2126, U+AB65, U+10140-1018F, U+101A0, U+1D200-1D24F); the rebuild loaded Fontsource Cardo with the full Latin range, so every English text was Cardo. Fixed: Cardo now has the legacy range (the legacy TTF), and Adobe Garamond Pro comes from Sefaria's Adobe Fonts kit `aeg8div` (the one templates/base.html loads), its regular/italic/bold woff2 preloaded so the text is in its real face at first paint (src/lib/fonts/typekit.ts, e2e/fonts.spec.ts checks the URLs against the live kit).",
  "Deployment note: the kit's allowed-domains list (Adobe Fonts settings, owned by Sefaria) must include the host this client is served from.",
])
add("TXD-061", ["VERIFIED 2026-10-06 (desktop and phone UA): a translation shown alone (lang=en) is black (#000) and justified; beside the source (lang=bi) it is #666 and left-aligned. The rebuild had #707070 left-aligned for both. Fixed."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
add("SRC-082", ["OWNER DECISION 2026-10-06: merge with Dicta as sefaria.org does. BUILT (src/lib/search/dicta.ts, a port of search.js dictaQuery/dictaBooksQuery/mergeQueries): Hebrew 'All Results' sends /search and /books to sefaria.loadbalancer.dicta.org.il beside Sefaria's own query (CORS: any origin, content-type allowed); Sefaria's Tanakh hits are dropped and Dicta's verses ('Tanach with Ta'amei Hamikra') merged; relevance rescales Dicta's -pagerank to Sefaria's mean/spread — the old quirk of dividing both means by the Sefaria count is KEPT so the order equals sefaria.org's; chronological puts Dicta first; filter-tree Tanakh counts are Dicta's; the total is the sum ('10,182+'), or under filters the merged buckets' sum; a failed /books (3 s timeout) or /search falls back to Sefaria's results. Every page re-sorts all hits loaded so far. VERIFIED with scripts/parity-search.mjs: 'אור' and 'שמע ישראל' (relevance), 'אור' chronological, filtered to Tanakh and to Talmud — tabs, first 2,500 characters of results and the filter list identical to sefaria.org."])
add("SRC-040", ["countLabel now prints the number then '+' when capped (the old SearchTotal.asString), so a Sefaria-only capped total still reads '10,000+' and a merged one '10,182+'."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st.pop("SRC-082", None)
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
