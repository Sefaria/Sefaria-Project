"""Signed-in reader: Save and reading history; multi-panel Step 2 ("Open" from the sidebar). Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["CON-033", "VER-011", "USL-001", "USL-009", "USL-011", "USL-002", "USL-010", "USL-012", "CON-036", "SHL-074", "CON-011"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
V = "VERIFIED 2026-10-07 on sefaria.org (scripts/parity-panels.mjs): "
add("CON-033", [V + "BUILT (MULTIPANEL_PLAN Step 2): 'Open' replaces the sidebar with a new text panel right after the reader's, the text as itself, bilingual when the reader's panel is (else the sidebar's language); parity equal for open-from-sidebar. A connected text's title is not a link (VERIFIED: on sefaria.org clicking it does nothing; ours was a link that left the workspace)."])
add("VER-011", [V + "a translation's 'Open Text' (and a source version's 'Open') also opens a new panel after the reader's, in that version: …&p2=Genesis.1.1&ven2=english|<title>&lang2=bi&aliyot2=0. BUILT; parity equal."])
SAVE = "BUILT 2026-10-07: the header's Save button is filled when the reader's saved items hold this place in these versions (GET /api/profile/user_history?saved=1&secondary=0&annotate=0), and a click sends POST /api/profile/sync?no_return=1 with user_history=[{ref, versions, time_stamp, action: add_saved|delete_saved}] and client=web (X-CSRFToken), as Sefaria.toggleSavedItem; signed out it opens the sign-up modal. The place is the old getHistoryObject's: the chosen verse while the sidebar is open, else the section. src/lib/user/history.ts, src/features/reader/use-reader-history.ts. Found: before this the button always opened the sign-up modal, even for signed-in readers."
for i in ["USL-001", "USL-009", "USL-011"]: add(i, [SAVE])
HIST = "BUILT 2026-10-07: reading history as ReaderApp.saveLastPlace — recorded when a text panel opens and when its sidebar opens (the chosen verse), and after 3 s on the same place when the place or version changes; signed in POST /api/profile/sync?no_return=1&annotate=1 with user_history=[{ref, versions, book, language, time_stamp}]; signed out the user_history cookie, newest first, trimmed to 3000 encoded bytes (MAX_ANON_HISTORY_BYTES), sidebar items not kept. The server itself skips history when the reader turned it off (user_profile.py:657). Found: nothing was recorded before. Not yet: sidebar (secondary) history, CON-036."
for i in ["USL-002", "USL-010", "USL-012"]: add(i, [HIST])
add("SHL-074", ["2026-10-07: the Save button now works (USL-011)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["CON-033"] = {"status": "done", "note": "Open replaces the sidebar with a new panel, as sefaria.org (parity equal)", "by": "src/features/reader/TextPanel.tsx"}
for i in ["USL-001", "USL-009", "USL-011"]: st[i] = {"status": "done", "note": "Save/remove on the server, state from the saved list; sheets wait for Voices", "by": "src/features/reader/use-reader-history.ts"}
for i in ["USL-002", "USL-010", "USL-012"]: st[i] = {"status": "partial", "note": "Primary history (server or cookie) done; sidebar (secondary) history CON-036 to do", "by": "src/features/reader/use-reader-history.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
