"""Reader header, verified on www.sefaria.org 2026-10-05 (16 texts x he/en/bi). Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("TXD-013", [
    "VERIFIED 2026-10-05: title = indexTitle + section part, in the language of the version on screen (ReaderPanelContext via useContentLang): Hebrew mode → source language; English mode → the TRANSLATION's language family; bilingual, or a family other than english/hebrew → the interface language. So /Zohar,_Bereshit.1?lang=en has a Hebrew title ('ספר הזהר, בראשית א׳') because its translation is Hebrew; Genesis lang=he → 'בראשית א׳'.",
    "VERIFIED 2026-10-05: the version line shows only in English and bilingual modes (never Hebrew-only) and is the translation's shortVersionTitle, else its versionTitle. Genesis he: no version line; Berakhot he: only the attribution.",
    "The header is hidden entirely on phones when the sidebar is open (mode TextAndConnections; ReaderPanel.hideReaderControls).",
])
add_details("TXT-009", [
    "VERIFIED 2026-10-05: the attribution line ('The William Davidson Talmud' / 'תלמוד מהדורת ויליאם דוידסון', language per the title rule) shows in every language mode for categories starting Talmud › Bavli; the version name beneath it is parenthesised ('(Koren - Steinsaltz)'). In the reader header it is NOT a link (linked={false}); on the book page it is. Mishnah Berakhot has no attribution; Yerushalmi has none.",
])
add_details("VER-005", ["VERIFIED 2026-10-05: see TXD-013 — shown for English/bilingual only, short title preferred."])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
