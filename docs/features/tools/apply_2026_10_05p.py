"""Copy formatting verified 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
for fid in ("TXD-001", "TXD-058"):
    add(fid, [
        "VERIFIED 2026-10-05 (Genesis 1:1-3, bilingual, copy event listener on the live page): text/html is `<div><span class=rangeSpan><div class=segment …><p class=segmentText><div dir=rtl>HEBREW </div><div dir=ltr>ENGLISH  </div></p></div></span>…</div>` — segment and rangeSpan wrappers survive, numbers, dots, footnote markers ('a', 'b') and links are gone, the drop-cap <big> survives; text/plain is one line per version, each ending in a newline (trailing spaces kept); the event is default-prevented; no citation is appended.",
        "Rebuild: cleaned in src/lib/reader/copy.ts — one <div dir> per version, no segment wrappers (simpler markup, same text), plain text trimmed; continuous layout is running text; open footnotes are copied after ' *'. Hooks: TextColumn onCopy.",
    ])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
for k in ("TXD-001", "TXD-058"): st[k] = {"status": "done", "note": "Clean copy; markup simpler than the old", "by": "src/lib/reader/copy.ts"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
