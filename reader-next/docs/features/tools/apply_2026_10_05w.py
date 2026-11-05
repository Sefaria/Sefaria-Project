"""Library pages verified 2026-10-05 (scripts/parity-library.mjs: 25 pages, main column and sidebar text identical). Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("LIB-001", [
    "VERIFIED 2026-10-05 (/texts, English): 'Browse the Library' heading, 14 category cards in two columns (coloured top line, serif name, grey short description), sidebar 'A Living Library of Torah' (+ Learn More, Getting Started (2 min) video link), a promo (Strasbourg/Strapi, not rebuilt), Translations (15 languages → /translations/<code>), Learning Schedules, RESOURCES (upper-case) and the footer links. No API request: the catalog is in the page. Main column text and sidebar text identical to the rebuild's.",
    "Layout (1280px): main column x=98…763 (665px), sidebar from x=860, 420px wide, 44px padding; same frame as book pages; category-coloured 4px line on category and book pages.",
])
add("LIB-008", ["VERIFIED on 25 pages (/texts/Tanakh, Tanakh/Torah, Mishnah, Talmud, Tosefta, Halakhah/Mishneh Torah, Liturgy, Kabbalah, Jewish Thought, Responsa, Reference, Midrash, Chasidut, Musar, Second Temple …): text of the main column identical. Sidebar 'About <Category>' comes from the category's long description."])
add("LIB-009", ["VERIFIED: /texts/Talmud shows the Bavli (title TALMUD, toggle BABYLONIAN / JERUSALEM — upper-case in the page) and the 'The William Davidson Edition' credit; /texts/Tosefta shows the Vilna edition with VILNA / LIEBERMAN."])
add("LIB-011", [
    "Rebuild: the toggle is a real link per edition (/texts/Talmud/Yerushalmi); the old source used spans with onClick and no href.",
    "VERIFIED About rule: /texts/Tosefta shows 'About Tosefta', /texts/Tosefta/Lieberman Edition shows 'About Lieberman Edition' (its own description), /texts/Talmud/Bavli and /Yerushalmi show 'About Talmud'. The old code derived this from the ORIGINAL path (Tosefta alone ≠ Tosefta/Vilna Edition).",
])
add("LIB-017", ["VERIFIED: Tanakh page sidebar = About Tanakh, Weekly Torah Portion (portion name, ref, Haftarah, 'All Portions ›'), Visualizations, Support Sefaria; Talmud/Bavli = About Talmud, Daily Learning (Daf Yomi), Visualizations…; Torah = About Torah + Visualizations. 'Visualizations' lists those whose name contains one of the page's categories ('Torah' also matches 'Mishneh Torah': six links on /texts/Tanakh/Torah)."])
add("LIB-069", ["Rebuild: /texts and /texts/<path…> are routes of their own; 'Tanach' → 301 to 'Tanakh'; an unknown path shows the home page at that address."])
add("LIB-031", ["VERIFIED footer link list (13): About, Help, Contact Us (mailto), Newsletter, Blog, Instagram, Facebook, YouTube, Shop, Terms, Privacy Policy, Ways to Give, Donate (c_src=Footer; a different campaign in Hebrew)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
for k in ("LIB-001", "LIB-008", "LIB-009", "LIB-010", "LIB-011", "LIB-012", "LIB-014", "LIB-015", "LIB-016", "LIB-017", "LIB-023", "LIB-024", "LIB-028", "LIB-030", "LIB-031", "LIB-033", "LIB-035", "LIB-037", "LIB-038", "LIB-039", "LIB-040", "LIB-041", "LIB-067", "LIB-069"):
    st[k] = {"status": "done", "by": "src/ui/CategoryPage, src/ui/NavSidebar, src/features/library"}
for k, n in [("LIB-002", "Heading done; language toggle and editor buttons not"), ("LIB-005", "Not built"), ("LIB-026", "CMS promo slot not built (dynamic marketing)")]:
    st[k] = {"status": "partial" if k == "LIB-002" else "todo", "note": n}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
