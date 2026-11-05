"""Share and Feedback, verified on www.sefaria.org 2026-10-05 (nothing sent). Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("CON-061", [
    "VERIFIED 2026-10-05 (Genesis 1:1): the Share view has sections 'Share Link' / 'שיתוף קישור' (a box with the full current address — it includes with=all&lang2=bi — and a copy button) and 'More Options' / 'אפשרויות נוספות' with 'Share on Facebook' (פייסבוק), 'Share on X' (X), 'Share by Email' (אימייל). Header '‹ Resources'.",
    "VERIFIED: opening Share (or Feedback) from the Tools row does NOT change the address bar — it stays with=all; and loading ?with=Share directly is read as a text filter named 'Share' ('No connections known for Share here.'). So on the old site these two views are state-only and cannot be deep-linked. Rebuild: they are normal sidebar views (with=Share, with=Feedback), because the owning panel's sidebar state lives in the URL — an intentional improvement.",
    "BUG (old, not ported): the copy button's accessible name is 'Copy Link to Sheet' although it copies the text's link. Rebuild: 'Copy link' and a 'Link copied' status.",
])
add("CON-067", [
    "VERIFIED 2026-10-05: text 'Have some feedback? We would love to hear it.' / 'אנחנו מעוניינים במשוב ממך', a type dropdown (placeholder 'Select Type' / 'סוג משוב'), a textarea ('Describe the issue...' / 'טקסט המשוב'), for signed-out readers an 'Email Address' box, and 'Submit' / 'שליחה'. Types: Report an issue with the text (דיווח על בעיה בטקסט), Request translation (בקשה לתרגום), Report a bug (דיווח על תקלה באתר), Get help (עזרה), Request a feature (בקשה להוספת אפשרות באתר), Give thanks (תודה), Other (אחר).",
    "Messages: 'Please select a feedback type' / 'אנא בחרו סוג משוב'; 'Please enter a valid email address' (no Hebrew string exists in the interface file); failure: 'Unfortunately, there was an error sending this feedback. Please try again or try reloading this page.' / 'לצערנו ארעה שגיאה בשליחת המשוב. אנא נסו שוב או רעננו את הדף הנוכחי'.",
    "BUG (old, not ported): the failure handler calls this.setState inside a non-bound callback, so after the alert the box stays on 'Feedback sent!' (or throws). Rebuild: a failed send returns to the form with the error and the typed text.",
    "Not exercised live (it would send a real report to Sefaria): the request shape (form field json = {refs, type, url, currVersions, email, msg, uid}) is taken from the source and reproduced by the rebuild; its e2e intercepts the request. The response's CORS headers for a cross-origin caller are UNVERIFIED — ask the owner before testing against production.",
])
add("SRC-094", ["Strings from the interface file: searching = 'Searching...' / 'מבצע חיפוש...'; loading more = 'Loading more results...' / 'טוען עוד תוצאות...'."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["CON-061"] = {"status": "done", "note": "Link box, copy, Facebook/X/email; deep-linkable unlike the old site", "by": "src/ui/ShareView"}
st["CON-067"] = {"status": "done", "note": "Form, validation, request; never exercised against production", "by": "src/ui/FeedbackView, src/lib/feedback"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
