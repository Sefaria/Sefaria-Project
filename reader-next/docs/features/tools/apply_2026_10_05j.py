"""Table of contents (sidebar), verified on www.sefaria.org 2026-10-05. Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("BOK-008", [
    "VERIFIED 2026-10-05 (Genesis 2:3, sidebar): clicking a chapter navigates the owning panel (URL → /Genesis.5) and the sidebar STAYS on the table of contents (with=Navigation kept), contrary to the props.close() in the code (that closes the book-page overlay, not the sidebar). Rebuild: links are real anchors; a plain click goes in place, a modified click opens normally.",
])
add_details("BOK-009", [
    "VERIFIED 2026-10-05: text of the sidebar contents identical to the rebuild's for Genesis, Berakhot, Mishneh Torah, Pesach Haggadah, Zohar (both structures) and Jastrow, including the marked current places (scripts/_toc-diff.mjs, _toc-essay.mjs). Genesis 2:3 marks TWO places: chapter 2 and aliyah 1 of Bereshit (2:3 closes the first aliyah).",
    "Rebuild: the current place is marked with data-current (and aria-current='location'); the router's Link replaces aria-current with 'page' on an exact-URL match, so tests use data-current.",
])
add_details("BOK-014", [
    "Rebuild: Talmud/Folio labels come from the shared address helpers; Hebrew dafs use the same punctuation as the text headings ('ב.' / 'ב:'); Year = 1241 + n with gershayim. Section-name terms in Hebrew come from a small static table (hebrewTerm) — extend it as live comparisons find missing terms.",
])
add_details("BOK-017", [
    "CORRECTION (VERIFIED 2026-10-05 on Zohar, Introduction): the toggles are real <a class='altStructToggle' href='…&tab=<Struct>'> anchors, but a click only changes component state — the address bar does not change (the atlas summary 'reflected in the URL' is wrong). The tab labels are the alt-structure keys ('Daf', 'Essay'); the plain schema tab is absent when exclude_structs lists it (Zohar, Berakhot).",
    "The rebuild matches the contents of both Zohar tabs text-for-text (46,284 characters in Essay).",
])
add_details("BOK-018", [
    "VERIFIED 2026-10-05: Genesis sidebar = 'Chapters' + 50 links, 'Torah Portions' + each portion (title links to its first aliyah) with aliyot 1-7; no toggle. isTorah is by TITLE (the five books), not by category.",
])
add_details("BOK-015", [
    "VERIFIED 2026-10-05: Berakhot's default structure is 'Chapters' (the schema is excluded): 'Chapter 1; MeEimatai' … each over its dafs (2a … 13a), the shared daf 13a appearing under both chapters; the first/last dafs of a range link to the range ('Berakhot 2a:1-14'). Essay nodes of Zohar are titled blocks ('1', '2', …) over paragraph numbers.",
])
add_details("BOK-010", [
    "VERIFIED 2026-10-05 (Pesach Haggadah): every top-level node with depth 1 is a single title link (Kadesh, Urchatz, …) to '<book>, <title>'; the current one is marked when it equals the section ref. At the top level nothing is collapsed (the collapsed array is empty), so collapsing only affects nested nodes.",
    "BUG (old, not ported): the collapsible titles are role=heading aria-hidden='true' with tabIndex 0 and an onClick — a focusable control hidden from assistive tech. Rebuild: a real button with aria-expanded.",
])
add_details("BOK-012", ["Ported and unit-tested on a synthetic three-level record (no recorded book is deeper than two levels in the sidebar): headings 'Volume 1', 'Volume 3', the empty one skipped."])
add_details("BOK-013", ["Ported and unit-tested on a synthetic record; links end at the first branch the old refPathTerminal finds (arrays count as non-empty even when all zeros — kept)."])
add_details("BOK-016", ["VERIFIED 2026-10-05 (Jastrow): 'Browse By Letter' + 22 letters, then 'Preface', 'Hebrew or Aramaic Abbreviations', 'List of Abbreviations' links. The old TOC also renders a DictionarySearch box for lexicon books — not yet rebuilt."])
add_details("CON-013", ["Table of Contents row verified: opens the sidebar contents (with=Navigation)."])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)

S = pathlib.Path(__file__).resolve().parents[1] / "rebuild-status.json"
st = json.load(open(S))
for k, note in [
    ("BOK-008", "Sidebar links go in place; the book page will reuse TocView"),
    ("BOK-009", "Sidebar view done, text identical to sefaria.org for six books"),
    ("BOK-010", "Done in TocView; the book-page overlay not built"),
    ("BOK-011", "Done in TocView"),
    ("BOK-014", "Done"),
    ("BOK-015", "Done (Genesis portions, Berakhot chapters, Zohar essay verified)"),
    ("BOK-016", "Letters done; the dictionary search box is not"),
    ("BOK-017", "Done; matches the old click-only (no URL) behaviour"),
    ("BOK-018", "Done"),
]:
    st[k] = {"status": "partial" if k == "BOK-016" else "done", "note": note, "by": "src/ui/TocView/TocView.tsx, src/lib/toc/"}
for k, note in [("BOK-012", "Ported, synthetic tests only"), ("BOK-013", "Ported, synthetic tests only")]:
    st[k] = {"status": "partial", "note": note, "by": "src/lib/toc/model.ts"}
st["CON-013"] = {**st.get("CON-013", {}), "status": "partial", "note": "About, Translations, Table of Contents work; Search in this Text not yet"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
