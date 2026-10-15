"""Topics, manuscripts, Torah readings, web pages and two count corrections, verified on www.sefaria.org 2026-10-05. Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("CON-013", [
    "CORRECTION (VERIFIED 2026-10-05): the Translations count is the number of non-source versions of the SELECTED VERSE (/api/texts/versions/<segment ref>): Berakhot 2a:1 shows Translations (5) although the amud has 6. For Genesis 1:1 both are 46, which hid the difference. The v3 text response's available_versions is per section and must not be used for this count.",
])
add_details("CON-014", [
    "VERIFIED 2026-10-05 (Berakhot 2a:1): the 'Web Pages' row has NO number — it only shows one once the pages have been loaded (by visiting the view); Sheets (46), Topics (7), Manuscripts (4), Translations (5) are shown.",
])
add_details("CON-046", [
    "VERIFIED 2026-10-05: Genesis 1:1 → Creation, \"In the Beginning of\" (the quotes are part of the title), Heavens, Creation of Heavens and Earth, Parashat Bereshit, Earth, Ai — seven, matching the Resources count; Berakhot 2a:1 → Laws of the Recitation of Shema, Laws of Blessings, Shema, Prayer, Priesthood… Each item: title link (/topics/<slug>, new tab), three-dots tooltip, markdown description. Header '‹ Resources'.",
    "Data is the topics array of /api/related/<section>?with_sheet_links=1 (already loaded for the Resources counts): each entry carries title, description, dataSource and order.pr; one topic has several entries (one per data source), merged and ordered by order.pr descending. No extra request.",
    "Rebuild a11y: description links are underlined (axe link-in-text-block); the three dots are an icon with the note as its accessible name.",
])
add_details("CON-060", [
    "VERIFIED 2026-10-05 (Genesis 1:1): one card — thumbnail (links to the full image), 'Leningrad Codex (1008 CE)', 'Location: LC Folio 1v', 'Courtesy of: Bruce Zuckerman, West Semitic Research…', 'Source: dornsife.usc.edu'. Rebuild adds an empty-state message ('No manuscripts known here.').",
])
add_details("CON-059", [
    "VERIFIED 2026-10-05 (Genesis 1:1): 'Torah Reading / קריאה בתורה', PocketTorah / \"פוקט\"-תורה, the description, a player reading '0:00 / 0:06', License: CC-BY-SA, Source: PocketTorah.",
    "Rebuild fixes: the empty state says so instead of 'Loading…' forever; the Hebrew licence label is 'רשיון' (the old 'עסק רשיון' is a typo); the play button is a labelled button, not an image input with a relative path.",
])
add_details("CON-052", [
    "VERIFIED 2026-10-05 (Berakhot 2a:1): 516 pages in 31 sites — Halachipedia (145), Torat Har Etzion (120), Orthodox Union (OU Torah) (48), Times of Israel Blogs (28), Hadran (21)… then the Hebrew sites (פרויקט בן-יהודה (48), סִינַי (19)…); footer 'Sites that are listed here use the Sefaria Linker'. For Genesis 1:1 the live view stays on 'Loading web pages...'.",
    "BUG (vendored toolkit, not the old site): the generated response contract for /api/related/<ref>/websites required authors and articleSource to be strings, but the API sends null (and arrays/objects when present), so every response failed validation. Fixed in vendor/sefaria-toolkit (docs/VENDOR.md).",
])
add_details("CON-053", ["Sorting verified through the site order above and the old code (interface-language pages first, fewer anchor verses, single verses before ranges, Linker hits)."])
add_details("CON-054", ["VERIFIED 2026-10-05: the Linker footer is present on the sites list."])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
