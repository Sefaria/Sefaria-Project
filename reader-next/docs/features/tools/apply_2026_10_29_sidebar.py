"""Sidebar parity pass (Mishnah Peah 4:1, with=Commentary ConnectionsList, lang2=en|he): the category book list, the
Resources home spacing, the header back link and the text list title/numbers, all VERIFIED on www.sefaria.org. Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["CON-012", "CON-020", "CON-021", "CON-025", "CON-026", "CON-032", "CON-070"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
def replace(fid, old, new):
    by[fid]["details"] = [new if d == old else d for d in by[fid]["details"]]

# CON-020: the zero-count rows carry no "(0)", and a deep link can miss them altogether
by["CON-020"]["summary"] = "When a narrower ref is selected, every commentator available elsewhere in the section is still listed, greyed out and without a count."
add("CON-020", [
    "VERIFIED 2026-10-29 (Mishnah Peah 4:1 → Commentary): zero-count rows (Boaz, German Commentary, Rashash, Tosafot Rabbi Akiva Eiger) show no count at all — TextFilter's showCount is !!count — in #6f6f6f with their description in #ccc.",
    "Legacy quirk, not ported: opened straight from a URL (…?with=Commentary%20ConnectionsList), the old client caches the summary (_linkSummaries) before it is rebuilt with the section's links, so the zero-count rows are missing until the summary is rebuilt; reached by clicking (segment → Commentary) they are there. The rebuild always lists them.",
])

# CON-021: the "content language" of the re-sort is the sidebar's own (lang2)
add("CON-021", ["VERIFIED 2026-10-29: the Hebrew re-sort follows the sidebar's language (lang2, ConnectionsPanel contentLang), not the interface: lang2=he lists Bartenura, Rambam, Ikar Tosafot Yom Tov, Yachin, Boaz, then the Hebrew alphabet (ביאור אנגלי על המשנה…); lang2=en keeps English Explanation of Mishnah second."])

# CON-025: what the list actually looks like, and where most descriptions come from
add("CON-025", [
    "Descriptions: most commentaries' indexes have none (Bartenura on Mishnah Peah: enShortDesc ''), so linkSummary falls back to getDescriptionDict — the short description of the TOC node named after the book, found under the index's categories cut where the book's name starts (Mishnah › Rishonim on Mishnah › Bartenura → '16th-century commentary printed in most editions of the Mishnah…'; 'Ramban on Exodus' answers to 'Ramban'). When the fallback runs, both languages come from the category, even an empty Hebrew one.",
    "VERIFIED 2026-10-29 display (1280px): no book icon (only the top-level rows have one); each category group is topped by a 4px rule in its colour (Commentary #4b71b7, Quoting Commentary #cb6158), 15px in from the panel's edges, and the list starts flush under the header; every row 19px above and below with a 1px #E5E5E5 rule beneath; titles 18px/21.6px serif, the 'All …' row #000 and books #333; counts Roboto 16px weight 100 #666 letter-spacing 1px; a description under every row, Roboto 14px #666, 10px below the title (16.8px lines; 21.6px on the 'All' row); the EN tag (12px/18px, #ccc border, radius 3px) at the end of the title line only, so the description takes the full width; no underline on hover.",
    "VERIFIED 2026-10-29: names and descriptions follow the sidebar's language (lang2) strictly — ContentText shows only that language, with no fallback (lang2=he: Hebrew names, no English description where the Hebrew is missing) — the group is right-to-left in Hebrew (s2.css `.interface-english .readerPanel.hebrew .categoryFilterGroup`) and the EN tags are hidden.",
])

# CON-026: the upper-casing belongs to the text list's title, not the "All" row
replace("CON-026", "Upper-cased when book equals category (the 'All' row); lowlight when count 0.",
        "Upper-cased when book equals category — in practice the text list's title for a whole-category filter ('COMMENTARY'); a book's title keeps its case ('Bartenura', VERIFIED 2026-10-29). The category list's 'All Commentary' row is a CategoryFilter and is not upper-cased. Lowlight when count 0.")

# CON-032: the anchor numbers only show on a phone
add("CON-032", ["VERIFIED 2026-10-29: beside its text (multiPanel) the numberLabel is hidden by s2.css `.multiPanel .textRange .numberLabel {display:none}` (itag labels excepted); only a single-panel (phone) sidebar shows a commentary's verse numbers."])

# CON-070: the back link's type
add("CON-070", ["VERIFIED 2026-10-29: the back link ('‹ Resources') and the static title share one style — Roboto 16px, weight lighter (100), #666, letter-spacing 1px; the chevron #6f6f6f, 10px before the word."])

# CON-012: Resources home vertical rhythm
add("CON-012", ["VERIFIED 2026-10-29 (Mishnah Peah 4:1, 1280px): first tool's text 30px under the header; tool rows ~40.5px apart; section headings ('Related Texts', 'Resources', 'Tools') #666 Roboto 14px/18px with 13px to a 1px #ccc rule, their text ~50px below the previous row's and ~52px above the next row's (margins 30/15 collapsing into the rows' 19px); category names #000, counts as CON-025; 'More' #666 with the navy dots."])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
for i in IDS:
    st[i] = {**st.get(i, {}), "status": "done", "note": "Re-verified against sefaria.org 2026-10-29 (sidebar parity pass): geometry, colours, language", "by": st.get(i, {}).get("by", "src/ui/ConnectionsPanel")}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
