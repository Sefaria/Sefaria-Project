"""Continuous layout numbers verified 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("TXD-046", [
    "VERIFIED 2026-10-05 (Berakhot 2a, Hebrew, panel class `readerPanel serif hebrew continuous`): segments, their <p> and the rangeSpan are all display:inline. Numbers sit in the gutter just past the text on the reading-start side (x=1006 for text ending at 990) at the top of the line where their segment begins; link-count dots in the gutter on the other side (x≈258). Two segments beginning on one line (2a:3 and 2a:4): their numbers are moved by script — in the live DOM they ended at x=295 and x=284, i.e. over the text, not in the gutter (the collision fix of placeSegmentNumbers goes wrong here).",
    "Rebuild: the segment is not positioned in continuous layout, so its absolutely positioned number and dot keep the line they would have been on (top:auto) and take their horizontal place from the surface; numbers sharing a line step outward by 20px (src/lib/reader/spread-numbers.ts) instead of landing on the text.",
])
add("TXD-047", ["Same gutter geometry in segmented layout: number box 30px wide, 18px beyond the text end on the reading-start side at desktop width (x=1008 for text ending at 990), 16px at phone width."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["TXD-046"] = {"status": "done", "note": "Gutter placement matches; collisions step apart (live's fix misplaces them)", "by": "src/ui/Segment/Segment.module.css, src/lib/reader/spread-numbers.ts"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
