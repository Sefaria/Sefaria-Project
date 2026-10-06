"""Commentary-link conversion, verified on www.sefaria.org 2026-10-05. Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
by["RTE-063"]["summary"] = ("Opening a commentary ref from inside the app (a link, a citation, search) — e.g. Rashi on Genesis 1:1:4 — shows the base text "
    "with that commentator selected in the sidebar. Loading the commentary's URL directly does not convert.")
add_details("RTE-063", [
    "VERIFIED 2026-10-05: direct page loads never convert — /Rashi_on_Genesis.1.1.4 and /Tosafot_on_Berakhot.2a.1.1 open the commentary as its own text (server-built panels skip openPanelAt). Earlier wording ('Opening a commentary URL…') implied they did.",
    "VERIFIED 2026-10-05: an in-app click on /Rashi_on_Genesis.1.1.4 → /Genesis.1.1?lang=en&with=Rashi (Genesis 1:1 highlighted, Commentary sidebar); /Tosafot_on_Berakhot.2a.1.1 → /Berakhot.2a.1?with=Tosafot; /Rashi_on_Genesis.1.1 (depth 2) and /Mishnah_Berakhot.1.1 open as themselves. All open panels are replaced (openURL → openPanel).",
])
add_details("TXT-015", ["VERIFIED 2026-10-05: applies to in-app opens only, never to direct loads (see RTE-063)."])
add_details("SHL-045", ["VERIFIED 2026-10-05: in-app opens only; direct loads read the commentary as its own text (see RTE-063)."])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)

# ── Resources home (verified 2026-10-05, Genesis 1:1, desktop, signed out) ──
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
add_details("CON-071", [
    "VERIFIED 2026-10-05: connection counts include sheets from collections listed in the library, served as links when `with_sheet_links=1` (old client: /api/related?with_sheet_links=1). Genesis 1:1 Commentary = 958 with them, 957 without (/api/links?with_text=0 omits them; add with_sheet_links=1).",
])
add_details("CON-015", [
    "VERIFIED 2026-10-05: on a single-text desktop page the Tools list is Add to Sheet, Dictionaries, Notes, Share, Feedback, Advanced — no Compare Text (openComparePanel is not passed in that case).",
])
add_details("CON-013", [
    "VERIFIED 2026-10-05: Genesis 1:1 → About this Text, Table of Contents, Search in this Text, Translations (46). The count equals the non-source entries of the v3 response's available_versions for the section (the book-level versions endpoint says 50).",
])
add_details("CON-014", [
    "VERIFIED 2026-10-05: Genesis 1:1 → Sheets (979, sheets deduplicated by id), Web Pages (no number while loading), Topics (7), Manuscripts (1), Torah Readings (1).",
])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
