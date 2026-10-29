"""Open-translations banner verified 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("TXD-064", [
    "VERIFIED 2026-10-05: on Genesis 1 in English and in bilingual, a 60px strip sits directly under the panel header: 'Want to change the translation?' ('change' bold) / 'מעוניינים בתרגום אחר?', a button 'Go to translations' / 'לרשימת התרגומים' and a '×'. The button opens the sidebar on Translations (URL gets with=Translations&lang2=en — and a stray aliyot=0) and sets the SESSION cookie open_trans_banner_shown=1 (JSON value 1, path /); the '×' sets it too. Not shown in Hebrew-only. Corpus comes from the index (Genesis → Tanakh).",
    "Rebuild: TextColumnBanner component + src/lib/reader/translations-banner.ts; shown only after mount so server and client renders agree.",
])
add("TXD-063", ["NOT REBUILT (2026-10-05): needs the country the request came from (Cloudflare header), the account's stored preference and a profile setting; no account or server header exists here. Deferred with accounts (Phase 7)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["TXD-064"] = {"status": "done", "by": "src/ui/TextColumnBanner"}
st["TXD-063"] = {"status": "deferred", "note": "Needs country header + accounts"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
