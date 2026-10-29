"""Signed-in sidebar tools: Notes, Add to Sheet, Add Connection, Add Translation; sidebar history; sidebar citations. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["CON-049", "USL-005", "USL-007", "CON-034", "CON-065", "CON-062", "CON-036", "CON-038", "CON-011", "CON-067"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
NOTES = "BUILT 2026-10-07 (src/ui/NotesView, src/lib/user/notes.ts): signed in, the Notes tool shows a box (Add Note), Go to My Notes (Django's /texts/notes) and the reader's notes on the selected verses — GET /api/notes/<ref>?private=1 per verse, combined — each with a pencil to edit (Save / Cancel / Delete Note); POST /api/notes/ json={text, refs, type:'note', public:false[, _id]}; DELETE /api/notes/<id>. Notes are private (public notes are off on sefaria.org). The Tools row counts them. Note: the server's DELETE has no ownership check and no CSRF (legacy security issue, reader/views.py notes_api, sefaria/tracker.py:301-319) — reported, not changed here."
for i in ["CON-049", "USL-005", "USL-007"]: add(i, [NOTES])
add("CON-034", ["BUILT 2026-10-07 (src/ui/AddToSheetView, src/lib/user/sheets.ts): signed in, Add to Sheet shows the selected citation, the reader's sheets (GET /api/sheets/user/<uid>/date/0/0, newest chosen; 'Create a New Sheet' with a name box when none, POST /api/sheets/), Add to Sheet (POST /api/sheets/<id>/add, source={refs, version-he/en by direction; two same-direction versions as two sources}) and the confirmation linking the citation and the sheet (on this deployment's Voices, PUBLIC_VOICES_ORIGIN). Not yet: trimming a partial word selection (CON-056), the Google Docs promo (CON-057)."])
add("CON-065", ["BUILT 2026-10-07 (src/ui/AddConnectionView): signed in, Advanced → Add Connection with the texts open in the panels: one → 'Choose a text to connect.' (Browse waits for Compare Text, MULTIPANEL_PLAN Step 4); two → both refs, the type (None, Commentary, Quotation, Midrash, Ein Mishpat / Ner Mitsvah, Mesorat HaShas, Reference, Related Passage), Add Connection → POST /api/links/ json={refs, type}; more → 'We currently only understand connections between two texts.'"])
add("CON-062", ["BUILT 2026-10-07: signed in, Add Translation goes to Django's /translate/<ref>?next=<this page>, as the old addTranslation. Edit Text and Linker Admin Tools need editor/moderator rights the client does not know yet: not shown."])
add("CON-036", ["BUILT 2026-10-07: signed in, a connected text shown in the sidebar list (more than 100px inside its view) for 3 s is recorded once as secondary history: POST /api/profile/sync user_history=[{ref, versions:{en:null,he:null}, book, language, secondary:true}] (TextList onDwell). Signed out nothing (the cookie keeps no secondary items)."])
add("CON-038", ["BUILT 2026-10-07: a citation inside a connected text in the sidebar opens the cited text after the reader's panel and the sidebar stays (as a dictionary entry's citation, VERIFIED: parity lexicon-citation equal)."])
add("CON-011", ["2026-10-07: only a signed-out reader is gated; a signed-in reader gets Notes, Add to Sheet, Add Connection and Add Translation themselves."])
add("CON-067", ["2026-10-07: a signed-in reader is not asked for an email, and the feedback carries their uid (the sidebar had passed neither)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
for i in ["CON-049", "USL-005", "USL-007"]: st[i] = {"status": "done", "note": "Signed-in notes on the selection: add, edit, delete", "by": "src/ui/NotesView"}
st["CON-034"] = {"status": "partial", "note": "Add to Sheet works; partial-selection trimming (CON-056) to do", "by": "src/ui/AddToSheetView"}
st["CON-065"] = {"status": "partial", "note": "Two texts: done; one text's Browse waits for Compare Text", "by": "src/ui/AddConnectionView"}
st["CON-062"] = {"status": "done", "note": "Signed in → Django's /translate page", "by": "src/features/reader/ConnectionsPane.tsx"}
st["CON-036"] = {"status": "done", "by": "src/ui/ConnectionsPanel/TextList.tsx"}
st["CON-038"] = {"status": "done", "by": "src/features/reader/ConnectionsPane.tsx"}
st["CON-011"] = {"status": "done", "note": "Signed out gated; signed in gets the tools", "by": "src/features/reader/ConnectionsPane.tsx"}
for i in ["USL-002", "USL-010", "USL-012"]: st[i] = {"status": "done", "note": "Primary and sidebar (secondary) history; signed out in the cookie", "by": "src/features/reader/use-reader-history.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
