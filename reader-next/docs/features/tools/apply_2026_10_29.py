"""The three-dots source note (old ToolTipped): white tooltip card and solid dots, not the browser's title box. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["CON-046", "CON-045"]
for i in IDS: print(i, by[i]["name"])
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
def drop(fid, line):
    if line in by[fid]["details"]: by[fid]["details"].remove(line)
OLD = "VERIFIED (code, static/js/Misc.jsx:1458 ToolTipped; s2.css .tooltip-toggle::before, .three-dots-button, .topicButton .three-dots-button.tooltip-toggle::before) and against a screenshot of sefaria.org (Genesis 1:2, 'Depths'): the three dots are a focusable role=button div (tabIndex 0) whose aria-label is the note; the img inside has the same alt. The tooltip is CSS, not the browser's title: a ::before printing attr(aria-label), a white card, 13px Roboto, #6f6f6f (--medium-grey), 10px padding, radius 5, shadow 0 1px 3px rgba(0,0,0,.2), 180px wide, top-aligned with the button and 30px from its start side (toward the name; mirrored for Hebrew content), fading in over .75s on hover. The button is a 22px #ededec circle with static/img/three-dots.svg (three solid circles) at 10px. A click sends gtag 'onclick_ToolTipped' {classes, interfaceLang, keywordTargets}."
REBUILT = "Rebuilt 2026-10-29 as ui/Tooltip/SourceNote (on ui/Tooltip): before this it had a native title tooltip (a grey system box) and outline stroke dots, which did not match. It is now the white card and the solid dots. It is a real <button> named by the tooltip (aria-labelledby), it also shows on keyboard focus, and Escape hides it. Not ported: the onclick_ToolTipped gtag event (ask the owner)."
for i in IDS: add(i, [OLD, REBUILT])
drop("CON-046", "Rebuild a11y: description links are underlined (axe link-in-text-block); the three dots are an icon with the note as its accessible name.")
add("CON-046", ["Rebuild a11y: description links are underlined (axe link-in-text-block); the three dots are a button named by its tooltip (the note)."])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
