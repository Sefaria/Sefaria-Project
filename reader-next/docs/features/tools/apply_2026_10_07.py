"""Sub-pixel place keeping (TXD-068): a prepend left the linked verse a fraction lower, painted a pixel off. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
print("TXD-068", by["TXD-068"]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("TXD-068", ["FOUND 2026-10-07: scrolling moves in whole device pixels but text heights are fractional (22px at line-height 1.6 is 35.2px a line), so compensating a prepended section (Genesis 1 above Genesis 2:3: 3074.36px) left the verse 0.36px lower, which can paint a pixel off (e2e 'in place from the first visible frame' saw 326 → 327 at 1280px). FIXED: the engine scrolls the whole pixels and puts the remaining fraction in a sub-pixel padding above the content (kept in [0, 1)), so the verse's position is unchanged to the layout unit."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
