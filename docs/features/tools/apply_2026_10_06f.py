"""Multi-panel Step 0/1 (docs/MULTIPANEL_PLAN.md): exact legacy URLs, panel ids by position, citations as sefaria.org. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["SHL-066", "SHL-049", "SHL-010", "CON-033", "RTE-027", "RTE-049", "RTE-043", "CON-038"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
V = "VERIFIED 2026-10-06 on sefaria.org (scripts/probes/multipanel-probe*.mjs, scripts/parity-panels.mjs): "
add("SHL-066", [V + "the address is rewritten on arrival with the defaults filled in (/Genesis.1 → /Genesis.1?lang=bi&aliyot=0; a sidebar always has lang2). A sidebar takes a number slot: [A+sidebar, B] → ?lang=bi&with=all&lang2=en&p3=B&lang3=bi&aliyot3=0; [A, B+sidebar] → …&p2=B&lang2=bi&aliyot2=0&w2=all&lang3=en (the sidebar's language is lang<k+1>); panel 1's aliyot is dropped while its sidebar is open; aliyot is written for Torah books only (titleIsTorah). The old server drops p3 on reload (views.py stops at the first missing p<i>).",
  "OWNER DECISION 2026-10-06: read and write these URLs exactly. BUILT: encodeWorkspace ports makeHistoryState's URL assembly; defaults from the reader's settings; the arrival rewrite uses history.replaceState (same entry and state) after TanStack's deferred pushState. src/lib/workspace/legacy-urls.ts is the recorded corpus, each URL round-trips byte for byte (legacy-urls.test.ts)."])
add("RTE-049", ["See SHL-066: the old numbering (a sidebar takes a slot) is now written as well as read."])
add("RTE-043", [V + "a sidebar opened by the reader has one language (lang2=en, or he when the reader's default is Hebrew — openTextListAt never lets it be bilingual); an old link without lang2 shows and writes lang2=bi."])
add("RTE-027", [V + "a redirect to the canonical ref keeps the request's query as it was (/Gen.1.1?lang=en → 301 /Genesis.1.1?lang=en; /Gen.1.1 → /Genesis.1.1). The rebuild had re-encoded the query; fixed."])
add("SHL-049", [V + "a citation closes whatever is next to its panel — the panel's sidebar, or else the next panel even when the reader opened it — makes the verse holding the citation current, and opens the cited text right after: [Ramban on Genesis 1:1, Exodus 1] → citation Exodus 12:2 → /Ramban_on_Genesis.1.1.1?lang=bi&p2=Exodus.12.2&lang2=bi&aliyot2=0; a second citation replaces the first. OWNER DECISION: exactly as sefaria.org. BUILT (TextPanel onCitationClick); parity-panels equal."])
add("SHL-010", [V + "a new panel takes the reader's default language (the last one set), not the language of the panel it was opened from: the citation's panel is lang2=bi beside a lang=en panel. The rebuild's new panels write the stored setting (UrlDefaults)."])
add("CON-033", ["CORRECTION 2026-10-06 (" + V.strip() + "): 'Open' on a connected text does NOT move the main panel. It replaces the sidebar with a new text panel showing that text as itself (/Genesis.1.1?lang=bi&aliyot=0&p2=Rashi_on_Genesis.1.1.1&lang2=bi, 50/50). The rebuild followed the old atlas text (this panel goes there): wrong, fixed in MULTIPANEL_PLAN Step 2."])
add("CON-038", [V + "a citation inside a dictionary entry opens after the sidebar, which stays: …&with=Lexicon&lang2=bi&p3=Genesis.1.1&lang3=bi&aliyot3=0. A click on the entry itself does nothing."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["SHL-066"] = {"status": "done", "note": "URLs read and written exactly as sefaria.org (owner decision); corpus round-trips", "by": "src/lib/workspace/url.ts"}
st["SHL-049"] = {"status": "done", "note": "Citation closes what is next and opens there, as sefaria.org (owner decision)", "by": "src/features/reader/TextPanel.tsx"}
st["SHL-010"] = {"status": "done", "note": "New panels take the reader's default language, as sefaria.org", "by": "src/lib/workspace/url.ts"}
st["CON-033"] = {"status": "partial", "note": "Atlas corrected: Open replaces the sidebar with a new panel; built in MULTIPANEL_PLAN Step 2"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
