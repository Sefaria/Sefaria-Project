"""Multi-panel URL findings (verified on www.sefaria.org, 2026-10-04). Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("SHL-066", [
    "BUG (VERIFIED 2026-10-04): panel numbers follow the flat panel array, sidebars included, so [Text+Connections, Text] is written as ?with=all&p3=Exodus.1 — and the server stops at the first missing p{i}, so reloading that URL silently drops the third panel. The rebuild numbers logical panels sequentially (p2, w2 for its sidebar), which the old server also reads, and accepts gaps when decoding.",
    "BUG (VERIFIED 2026-10-04): `lang2` means both 'panel 2 language' and 'first sidebar language' (/Genesis.1.1?with=all&p2=Exodus.1&lang2=en is rewritten to …&lang2=en&p3=Exodus.1&lang3=en).",
])
add_details("SHL-039", [
    "VERIFIED 2026-10-04 at 1600px: [Text, Connections, Text] = 592/416/592px (37/26/37); four text/sidebar panels = 400px each (cap = floor(1600/360) = 4).",
])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
