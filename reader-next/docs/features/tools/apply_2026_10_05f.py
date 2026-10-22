"""Translation Open, verified on www.sefaria.org 2026-10-05 (Genesis 1:1). Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("VER-013", [
    "VERIFIED 2026-10-05: each preview is <a class=versionPreview href='/Genesis.1.1?ven=<current>&vside=The_Koren_Jerusalem_Bible&with=Translation Open'>; the click handler rewrites the URL to …&vside=The_Koren_Jerusalem_Bible|en&with=Translation Open (key '<title>|<language>', language = the version's `language`, 'en' for every translation). Both forms must be read.",
    "VERIFIED 2026-10-05: the view is: header '‹ Translations' (back to the list), an uppercase title chip with a coloured underline, the selected passage in ONLY that translation, then 'Open' and 'Add to Sheet'. One extra request: /api/v3/texts/Genesis.1.1?version=english|<title>&version=hebrew|…. The rebuild reuses the translations list it already fetched (no extra request).",
    "Rebuild: 'Add to Sheet' needs sign-in and arrives with the signed-in tools; the recent-versions chip row shows only the previewed version.",
])
add_details("VER-010", [
    "Rebuild a11y: the whole preview opens the sidebar through an overlay link (the old markup wraps the preview, which can contain footnotes and citations, in an <a> — a link inside a link).",
])
add_details("SHL-052", [
    "VERIFIED 2026-10-05: the sidebar's version filter lives in the URL as `vside` (panel 1) / `vside{n}`, and only matters for the Translation Open and Version Open views. The rebuild keeps it on the side panel's state and drops it when the view changes.",
])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
