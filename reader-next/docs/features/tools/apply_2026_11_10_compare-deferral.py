"""In-reader Compare Text is not in this launch (owner, 2026-11-10; LAUNCH_PLAN §8).

Moves the Compare Text panel's features from `todo` to `deferred`. The standalone /compare page (version diff) is built and
unaffected. Updates rebuild-status.json only. Idempotent: prints each change as "ID name: old -> new"; a second run prints nothing
but the summary. ATLAS_DIR overrides the directory (to test on a copy).
"""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = {f["id"]: f for f in json.load(open(T / "features.json"))}
status = json.load(open(T / "rebuild-status.json"))

NOTE = "Not in launch: in-reader Compare Text deferred (owner 2026-11-10, LAUNCH_PLAN §8); the standalone /compare page is built"
UPDATES = [
    ("SRC-025", "Compare-panel search box"),
    ("SRC-026", "Compare-panel search limitations"),
    ("BOK-004", "Book page in compare panel"),
    ("CON-066", "Compare text from sidebar"),
    ("LIB-003", "Library home in compare panel"),
    ("LIB-018", "Category page in compare panel"),
    ("SHL-037", "Compare panel header"),
    ("SHL-038", "Compare / 'other text' panel"),
]

changed = 0
for fid, name in UPDATES:
    assert atlas[fid]["name"] == name, f"{fid}: atlas name is {atlas[fid]['name']!r}, expected {name!r}"
    old = status.get(fid, {})
    new = {**old, "status": "deferred", "note": NOTE}
    if old != new:
        print(f"{fid} {name}: {old.get('status')} -> deferred")
        status[fid] = new
        changed += 1

if changed:
    json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
print(f"{changed} changed")
