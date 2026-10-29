"""Back/forward, verified on www.sefaria.org 2026-10-05. Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("RTE-054", [
    "BUG (VERIFIED 2026-10-05): selecting a verse adds TWO history entries — /Genesis.1.2?lang=en&with=all, then the same URL with &lang2=en appended (a second push). One Back press therefore lands on the same view with the sidebar still open. Loading a Torah page likewise rewrites the URL (&aliyot=0, RTE-064), costing another entry. The rebuild adds one entry per choice and never rewrites the URL after load.",
])
add_details("RTE-055", [
    "VERIFIED 2026-10-05: after Back/Forward the text column's scrollTop is restored from history state (643 after returning from a later scroll position).",
    "Rebuild: each history entry remembers every panel's place as a segment ref plus its offset from the column top (not a raw scrollTop, which is meaningless once the column holds different sections); saved at every history change while the page being left is still on screen, kept in sessionStorage, restored before paint on Back/Forward. Back to a different text starts a new column for it.",
])
add_details("SHL-064", [
    "BUG (rebuild, fixed 2026-10-05): going back to an entry created by choosing a verse left the column on the text that had replaced it (the column only restarted for entries without history state).",
])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
