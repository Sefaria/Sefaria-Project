"""Translations sidebar, verified on www.sefaria.org 2026-10-05 (Genesis 1:1). Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("VER-009", [
    "VERIFIED 2026-10-05: Genesis 1:1 → English (14), German (3), Esperanto (1), Spanish (3)… — languages by code with English first. Buckets come from a '[xx]' title suffix else the version's `language`; the v3 API's `actualLanguage` gives different buckets (18 'en') and must not be used.",
])
add_details("VER-011", [
    "A11y: the old markup puts the Select link inside the <summary> toggle (a control nested in a control; axe nested-interactive). The rebuild places Select beside the disclosure.",
])
add_details("VER-012", [
    "BUG (VERIFIED 2026-10-05): the Select link's href repeats the parameter: /Genesis.1.1?ven=THE_JPS_TANAKH:_Gender-Sensitive_Edition&ven=THE_JPS_TANAKH:_Gender-Sensitive_Edition, and omits the language family. The rebuild writes ven=<family>|<Title>.",
    "Rebuild: choosing a translation swaps the loaded text in place and keeps the reader's verse still; the sidebar stays on Translations with the new one marked current. Corpus preference cookie (VER-002) not yet ported.",
])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
