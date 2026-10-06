"""Signed-out gating of sidebar tools and the sign-up modal, verified on www.sefaria.org 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("GUI-004", [
    "VERIFIED 2026-10-05 (signed out, Genesis 1:1): Tools > Notes opens the modal 'Don’t lose that thought!' / 'Create a free account to do more on Sefaria' with four bullets (Take notes on this text; Build & create source sheets; Connect with other users; Get updates on new features), 'Sign Up' and 'Already have an account? Sign in'; Tools > Add to Sheet opens 'Want to make your own source sheet?' / 'Create a free account to join the conversation'. The address bar does not change and the sidebar stays on Resources behind the modal.",
    "Hebrew strings: Sign Up = 'להרשמה', 'כבר יש לכם חשבון?', 'התחברו', close = 'סגירה'.",
    "A11y (old): the modal is a div box with an overlay div and a '×' role=button; no focus trap, no dialog role. Rebuild: native <dialog> (focus kept inside, Escape, backdrop click, focus restored).",
    "REBUILD DECISION (pending owner): there is no sign-in in the new client. The modal's Sign Up / Sign in links go to www.sefaria.org/register|login?next=<current address>; the address is a path on the new client, so after signing in the reader lands on the old site's page for it. Real account handling is Phase 7 and needs the owner's design.",
])
add("CON-011", [
    "VERIFIED 2026-10-05 (signed out): Notes -> sign-up modal (kind Notes); Add to Sheet -> modal (AddToSheet); Advanced shows exactly two rows, 'Add Translation' / 'הוספת תרגום' and 'Add Connection' / 'הוספת קישור לטקסט אחר'; those open the AddTranslation / AddConnection modals (strings in signupModalContent.js). Compare Text shows in the Tools list on a desktop-width panel. Feedback and Share need no account.",
    "Rebuild: Notes, Add to Sheet and Add Connection views show Resources with the modal over it (URL briefly with=Notes etc.; closing returns to with=all).",
])
add("CON-048", ["Signed-out behaviour verified (modal). The note editor itself is not built (needs accounts)."])
add("CON-055", ["Signed-out behaviour verified (modal). The Add to Sheet flow is not built (needs accounts)."])
add("CON-062", ["Signed-out behaviour verified: Advanced > Add Translation opens the AddTranslation modal ('Have your own translation of this text?')."])
add("CON-065", ["Signed-out behaviour verified: Advanced > Add Connection opens the AddConnection modal ('Want to document a connection to another text?')."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["GUI-004"] = {"status": "done", "note": "Modal, all eight kinds; links go to the old account pages", "by": "src/ui/SignUpModal, src/ui/Modal"}
st["CON-011"] = {"status": "partial", "note": "Signed-out gating done; signed-in tools need accounts (Phase 7)", "by": "src/features/reader/ConnectionsPane.tsx"}
for k in ("CON-048", "CON-055", "CON-062", "CON-065"):
    st[k] = {"status": "partial", "note": "Signed-out modal only; the tool itself needs accounts (Phase 7)", "by": "src/features/reader/ConnectionsPane.tsx"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
