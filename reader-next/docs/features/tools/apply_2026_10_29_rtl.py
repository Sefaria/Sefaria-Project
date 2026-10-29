"""Text direction: every language-tagged run or block also carries its direction (LangText / ContentText). Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["I18-013", "I18-010", "GUI-012", "CON-032"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("I18-013", [
    "Old client: direction comes from CSS classes, not attributes — `.he` / `.int-he` / `.contentText.he` / `.readerPanel .he` set `direction: rtl` (and `text-align: right` in a panel); a connected text's block (`.segment.heOnly`) is rtl + justify, so a Hebrew commentary's short last line sits at the right. VERIFIED on sefaria.org Exodus 18:1 with=Rashi lang2=he, 2026-10-29.",
    "BUILT 2026-10-29: src/ui/LangText — LangText sets `lang` and `dir` together on any element (dir from the data, e.g. a version's `direction`, else lib/i18n/direction dirFor: he, arc, yi, jrb, ar, fa…); InterfaceText renders through it. The architecture rule `lang-with-dir` counts elements that set lang without dir (baseline may only shrink). Found: the sidebar's text list tagged only the inline text span, so Hebrew Rashi in an English-interface page laid out left-to-right (owner's screenshot, 2026-10-29).",
])
add("I18-010", [
    "BUILT 2026-10-29: lib/i18n/content-lang ContentLangProvider / useContentLang (the old ContentLanguageContext); the sidebar (ConnectionsPanel) provides lang2. ContentText shows the content-language side of {en, he} with its lang and dir, strict like the old ContentText (an optional `fallback` shows the other side in its own direction); with no provider it follows the interface language.",
])
add("GUI-012", [
    "Rebuild: InterfaceText also sets `dir` (the old `.int-he { direction: rtl }`; a fallback side keeps its own direction, the old `.enInHe` isolate).",
])
add("CON-032", [
    "Rebuild 2026-10-29: each item's text block carries the text's lang and dir (Hebrew right-aligned and justified like the old `.segment.heOnly`), and the item's title is in the sidebar's language (lang2), not the interface's.",
])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
