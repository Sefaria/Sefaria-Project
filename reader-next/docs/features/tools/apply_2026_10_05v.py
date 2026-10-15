"""Book page verified 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("BOK-001", [
    "VERIFIED 2026-10-05 (Genesis, Berakhot, Pesach Haggadah, Rashi on Genesis, Mishneh Torah, Zohar, Jastrow, Pirkei Avot, Kuzari; scripts/parity-book.mjs): the main column's text — title, category, [edition], Start Reading, Contents, Versions, the whole contents — is identical to the rebuild's. URL after load: /Genesis?tab=contents. Server rule: Ref.is_book_level() (no sections; a node like 'Pesach Haggadah, Kadesh' is a text).",
    "RECORDED MISTAKE (rebuild): the rebuild first opened a bare title at its first section (a 301 to /Genesis.1) — wrong; it is the book page. Corrected by e2e/routing.spec.ts.",
    "Layout (1280px): two columns, main ~700px at x≈110 and a pale sidebar 360px wide with About This Text / promo / Related Topics / Download Text; a category-coloured line under the header. 390px: one column.",
])
add("BOK-002", ["Rebuild: category link by the old rules (src/lib/book/book-page.ts); `dependence` of the index record (Commentary, Targum) decides the primary category, as the server's primary_category does. The William Davidson Edition credit for Bavli books (link /william-davidson-talmud)."])
add("BOK-003", ["Rebuild: Continue Reading is built from the last place kept in this browser's localStorage (src/lib/reader/last-place.ts) — the old client used user_history. Start Reading goes to the index's firstSectionRef."])
add("BOK-005", ["VERIFIED: tabs 'Contents' / 'Versions' (תוכן / מהדורות), ?tab=contents|versions in the address. Rebuild tab links are real links."])
add("BOK-018", ["VERIFIED on the book page: 'Torah Portions' is a small grey label over the portions in TWO columns, each portion's name large (a link to its first aliyah) over the aliyot as small plain numbers; 'Chapters' is a grid of 50px pale tiles with serif numbers."])
add("TXT-023", ["VERIFIED 2026-10-05: a bare book name (Genesis, Rashi on Genesis, Pesach Haggadah) is the book page, not a text; the reader's header title links to it in the rebuild."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
for k, note in [("BOK-001", "Page, contents, versions, sidebar; compare-panel mode and extended notes not built"), ("BOK-002", "Done; dedication unverified live"), ("BOK-003", "Start/Continue (continue from this browser)"), ("BOK-005", "Done"), ("BOK-006", "About, related topics, downloads; the promo module is not built"), ("BOK-007", "Done")]:
    st[k] = {"status": "partial" if k in ("BOK-001", "BOK-006") else "done", "note": note, "by": "src/ui/BookPage, src/features/book"}
st["BOK-022"] = {"status": "done", "by": "src/ui/RelatedTopics"}
st["BOK-023"] = {"status": "done", "by": "src/lib/catalog/index-details.ts"}
st["TXT-023"] = {"status": "done", "by": "src/features/book/book-route.ts"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
