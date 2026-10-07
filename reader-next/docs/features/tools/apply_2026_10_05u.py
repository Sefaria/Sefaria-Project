"""Phase 4 odds and ends, 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("SHL-035", ["Strings (source): 'Something went wrong! Please use the back button or the menus above to get back on track.' / 'ארעה תקלה במערכת. אנא חזרו לתפריט הראשי או אחורנית על ידי שימוש בכפתורי התפריט או החזור.' then 'Error Message: ' / 'שגיאה: ' + the text. Not reproduced live (no safe way to make the live reader fail). Rebuild: the router's default error component (RouteError) with the same words and a Try again button."])
add("SHL-040", ["Rebuild: a panel that arrives beside the first is scrolled into view (inline: nearest) when the row of panels overflows; the browser handles right-to-left. Tested with six panels at 1280px."])
add("I18-003", ["Rebuild: a panel opened beside the first takes keyboard focus on its first control; focus-visible rings replace the old 'user-is-tabbing' body class. Not rebuilt: focus into the sidebar when a verse opens it (it would take focus from the verse the reader just chose)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S = T / "rebuild-status.json"; st = json.load(open(S))
st["SHL-035"] = {"status": "done", "by": "src/features/shared/RouteError.tsx"}
st["SHL-040"] = {"status": "done", "by": "src/features/reader/TextPanel.tsx"}
st["I18-003"] = {"status": "partial", "note": "New-panel focus done; sidebar focus on verse click intentionally not", "by": "src/features/reader/TextPanel.tsx"}
json.dump(st, open(S, "w"), ensure_ascii=False, indent=1)
