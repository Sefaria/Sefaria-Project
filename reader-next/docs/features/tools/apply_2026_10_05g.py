"""About this Text, verified on www.sefaria.org 2026-10-05 (Genesis, Berakhot, Rashi on Genesis). Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("CON-039", [
    "VERIFIED 2026-10-05 (Genesis): headings 'About This Text' (large, mixed case, rule beneath), 'Genesis' (link to the book), 'TANAKH', description, 'Composed: Sinai/Canaan (c.1400 – c.400 BCE)'; then 'Current Translation', then 'Source Versions', then Related Topics and Download Text. Berakhot: 'Composed: Talmudic Babylon (c.450 – c.550 CE)'. Rashi on Genesis: 'Author:' + linked 'Rashi', 'Composed: Middle-Age France (c.1075 – c.1105 CE)'.",
    "Data (all cached): /api/v2/index/<title>?with_content_counts=1&with_related_topics=1 (authors, enDesc/heDesc, compPlaceString, compDateString, relatedTopics) and the versions of the section. The v3 text response's available_versions carries versionNotes, license, versionSource, digitizedBySefaria, purchaseInformationURL/Image, so no separate versions request is needed.",
    "Rebuild: descriptions are markdown rendered through marked and an allowlist sanitizer; version notes (HTML from the library) go through the same sanitizer — scripts, handlers and javascript: links cannot survive.",
])
add_details("VER-006", [
    "VERIFIED 2026-10-05: 'Current Version' appears only when a source version is chosen (?vhe=). Choosing one (Select Version on Berakhot, from lang=en, he or bi) writes ?vhe=hebrew|William_Davidson_Edition_-_Aramaic, ALWAYS switches to lang=bi, writes NO cookie (only translations are remembered), and the box then reads 'Current Version / Current Translation / Alternate Source Versions' (source first because the panel is no longer English).",
    "VERIFIED 2026-10-05: the source list is the versions flagged isPrimary; the current ones leave it only from their own language slot — Rashi on Genesis lists its English edition both as the Current Translation (language en) and under Source Versions (a separate version object with language he).",
    "The Select Version button is an <a class=selectButton> WITHOUT an href (a click handler only); the rebuild makes it a real link.",
])
add_details("VER-008", [
    "Rebuild: the form is native selects plus a link to https://www.sefaria.org/download/version/<title> - <lang> - <version>.<fmt> (the files are produced by sefaria.org); copyrighted versions (licence starting 'Copyright') are not offered; a merged version is offered per language family.",
])
add_details("BOK-022", ["VERIFIED 2026-10-05 (Berakhot): Prayer, Shema, Amidah, Blessings (Halakhah), Women, then 'More'. Links go to /topics/<slug> (sefaria.org until topic pages exist in the rebuild)."])
add_details("VER-016", ["Rebuild a11y/behaviour: titles are links that preview the version in the sidebar (Version Open / Translation Open); the old code throws when the title of the current version or translation is clicked (VER-006 BUG)."])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
