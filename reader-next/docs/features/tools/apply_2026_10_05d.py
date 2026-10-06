"""Version preferences, verified on www.sefaria.org 2026-10-05 (Exodus 1:1, Genesis 1:1). Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P)); by = {f["id"]: f for f in atlas}
def add_details(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add_details("VER-014", [
    "VERIFIED 2026-10-05 (Exodus 1:1, signed out, cookies set by hand): no cookies → Revised JPS, 2023; version_preferences_by_corpus={\"Tanakh\":{\"en\":\"The Koren Jerusalem Bible\"}} → Koren; translation_language_preference=es → 'Alfredo cerhy [es]'; both → Koren (corpus preference wins); a preference naming a version the text lacks → default; explicit ?ven= beats the cookie.",
    "Client rule (Sefaria._getVersionObjects): explicit translation must exist among the text's non-source versions or it is dropped; the corpus preference must also exist for this text; the language preference takes the highest-`priority` translation whose bucket (title '[xx]' suffix, else `language`) matches. Corpus = `corpora[0]` of the book's index (/api/v2/raw/index/<title>); only some books have one (Tanakh, Mishnah, Bavli…).",
    "An unknown ?version= is not an error in /api/v3/texts: it answers 200 with the primary version only and a warning (code 101) — so preferences must be validated against available_versions before use.",
])
add_details("VER-002", [
    "VERIFIED 2026-10-05: the cookie is a SESSION cookie (no expiry) holding URL-encoded JSON {\"Tanakh\":{\"en\":\"<title>\"}}; choosing a German translation stores it under the 'en' key (the version's `language` field is 'en' for every translation). Signed-in users also save it to the profile (not ported).",
    "Rebuild difference: the cookie lasts a year (max-age=31536000) instead of the browser session.",
])
add_details("VER-003", [
    "VERIFIED 2026-10-05: choosing a translation always sets lang=bi, whether the panel was English, Hebrew or bilingual (/Genesis.1.1?lang=en → …&ven=english|The_Koren_Jerusalem_Bible&lang=bi). The atlas's conditions ('has both versions…') are always true in a text panel, so the rule is simply 'bilingual'.",
])
add_details("VER-001", [
    "Rebuild: the cookie is read (VER-014); there is no setter UI or suggestion banner yet (VER-004, TXD-063).",
])
json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
