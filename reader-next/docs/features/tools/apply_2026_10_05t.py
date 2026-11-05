"""Named entities verified 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
for fid in ("CON-045", "TXD-022"):
    add(fid, [
        "VERIFIED 2026-10-05 (Berakhot 2a, English): clicking 'Rabbi Eliezer' selects the verse and the address becomes /Berakhot.2a.1?namedEntity=rabbi-eliezer-b-hyrcanus&namedEntityText=Rabbi Eliezer&with=Lexicon; the sidebar shows 'Rabbi Eliezer b. Hyrcanus' (link to /topics/<slug>, new tab) + 'Tannaim - Third Generation' + 'c.80 – c.110 CE' + the markdown description. Request: GET /api/v2/topics/<slug>?annotate_time_period=1&ref_link_type_filters=about|popular-writing-of&with_html=0&with_links=0&annotate_links=0&with_refs=0&group_related=0&with_indexes=0.",
        "An ambiguous name's slug ends in '-(ambiguous)' (e.g. /topics/רג-(ambiguous)); the response then carries `possibilities` (Rabban Gamliel → three people) and the sidebar says '\"Rabban Gamliel\" could refer to one of the following:' / 'ייתכן ש-\"…\" מתייחס לאחד מהבאים:' above each. No description: \"No description known for '<title>'\" / \"לא קיים מידע עבור '<title>'\".",
        "Rebuild: links in the text carry the library's absolute /topics URL (a modified click or a new tab works), a plain click opens the sidebar; choosing another verse ends the card (back to Resources). Params namedEntity, namedEntityText (+N per panel) in the workspace URL.",
    ])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["CON-045"] = {"status": "done", "by": "src/ui/NamedEntityView"}
st["TXD-022"] = {"status": "done", "by": "src/ui/NamedEntityView, src/lib/text/prepare.ts"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
