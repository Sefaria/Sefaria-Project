"""Category pages (/texts/<category>/...) brought to pixel parity with sefaria.org (desktop 1280 and a phone User-Agent). Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["LIB-008", "LIB-011", "LIB-012", "LIB-019", "LIB-026", "LIB-033", "LIB-035"]
for i in IDS: print(i, by[i]["name"])
V = " Verified on www.sefaria.org with Playwright, 2026-10-29."
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("LIB-008", [
    "Geometry (1280px): title row (.navTitle) 40px over the contents; the h1 is 30px/500 uppercase serif, black. Items are .navBlock: a 1px #EDEDEC top line, 24px/1.3 title (15px over, 8px under, 20px end margin), 14px/18px #666 description, 12px under; two 327.5px columns 10px apart, rows 6px apart. A grid NOT inside a section (e.g. /texts/Tanakh/Torah, the top of /texts/Kabbalah) keeps the old .gridBoxItem's 5px top/bottom padding — the zero-padding override only targeted .readerNavCategories and .category grids — so its rows are 16px apart and its first block starts 5px down; the last row's 6px margin collapses into the grid's 40px." + V,
    "Phone (singlePanel): the category's long description shows under the title (.categoryDescription.top: 14px #666, margin -26px 0 40px) and the sidebar has no About module. The description is the page category's (tocObjectByCategories(cats), so Talmud → Bavli's), rendered as plain text by ContentText text={…}: Markdown is NOT rendered there (live shows '*masekhtot*' with its asterisks on /texts/Mishnah) — a live bug, reproduced for parity." + V,
])
add("LIB-011", ["The toggles (.navToggles) are block flow despite their flex-direction (no display:flex): 13px lighter uppercase serif, 12px apart, 16px after the title, 4px down, 30px under; the current one black with a 2px #999 underline 4px below; the rest #666." + V])
add("LIB-012", ["Sections (.category): h2 18px uppercase serif #666, 20px over the contents, the short description inline (5px, not uppercase) or, when longer than 5 words, a 14px line under it (margin -8px 0 20px); 40px under each section (its grid's 40px folds into it)." + V])
add("LIB-019", ["The 4px category line (.categoryColorLine) is absolutely positioned at the top of .readerNavMenu, outside the scroller: on a wide screen it stays under the header while the page scrolls (and the page starts below it); on a phone it lies over the top of the page and scrolls with it." + V])
add("LIB-026", ["The Promo module renders an empty .navSidebarModule when the CMS has nothing (always, in practice): its 34px margin folds into its neighbours' except when it comes first — the phone home page (AboutSefaria is multiPanel-only) and phone category pages without a custom module (e.g. /texts/Mishnah) — where it pushes the first title 34px down. Order: TextsPage [AboutSefaria, Promo, Translations, …]; categories [AboutTextCategory, custom (WeeklyTorahPortion | DafYomi), Promo, Visualizations, SupportSefaria]." + V])
add("LIB-033", ["'Make a Donation' is .button.small: as wide as its label (176x39), padding 10px 14px, 12px under the text, the heart.png icon inverted to white, 18px, 10px from the label." + V])
add("LIB-035", ["Multi-panel only (TextCategoryPage passes it when multiPanel); a phone shows the description under the page title instead. Its Markdown is rendered (reactMarkdown), unlike the phone's copy." + V])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["LIB-026"] = {"status": "partial", "note": "Empty slot kept for spacing; CMS promotions not built", "by": "src/ui/NavSidebar (PromoSlot)"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
