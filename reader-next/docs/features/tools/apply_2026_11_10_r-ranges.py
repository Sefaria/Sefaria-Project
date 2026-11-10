"""Wave 2, lane R (ranges): long whole-section ranges, keys that do not scroll, keyboard/touch selection, Daf Yomi address, backslash titles. Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))

V = "VERIFIED 2026-11-10 on www.sefaria.org (Playwright, read-only, interfaceLang=english; lane-R report)"


def add(fid, lines, replace_prefix=None):
    """Append each line once; with replace_prefix, first drop the line(s) that start with it (an earlier statement this one corrects)."""
    print(fid, by[fid]["name"])
    d = by[fid]["details"]
    if replace_prefix:
        d[:] = [l for l in d if not l.startswith(replace_prefix)]
    for l in lines:
        if l not in d:
            d.append(l)


# D1: long ranges of whole sections (replaces lane D's "keeps its address, no blue" line)
add(
    "TXD-070",
    [
        "A range of whole sections longer than the sections loaded with the page (Genesis 1-50, Psalms 1-150) is all highlighted at once and written by its segments: "
        + V
        + ": /Genesis.1-50 is written /Genesis.1.1-50.26 before any text shows (from the server), then all 50 chapters load and every verse is blue (/Psalms.1-150 -> /Psalms.1.1-150.6 likewise); on two of three loads it later lost the scroll race and collapsed to /Genesis.1.1 (not ported). Here the highlight runs from the first segment to the end of the last section by address at once (sections the column loads later are blue as they arrive), and the address is rewritten in place (replaced entry, nothing moves) once the last section's length is known: one request for that section. Until it answers the address is the one typed. With the sidebar open the range of sections stays. Tests: src/lib/text/range-selection.test.ts, e2e/ranges.spec.ts ('a range of whole sections longer than what loads with the page').",
    ],
    replace_prefix="A range of whole sections longer than the sections loaded with the page",
)
status["TXD-070"] = {"status": "done", "note": "Kept and highlighted, sidebar open or closed, long ranges of whole sections included (legacy parity, verified 2026-11-10)", "by": "src/lib/text/range-selection.ts, src/features/reader/TextPanel.tsx"}

# D3: keys that do not scroll
add(
    "TXD-055",
    [
        "Fixed 2026-11-10 (lane R): only keys that scroll mark the reader as reading on (arrows up/down, Page Up/Down, Home/End, Space; not Shift+arrows, not in a field, not Space on a button; Tab when a scroll follows it at once), and the mark clears when the scroll settles. Any key used to count and the mark was never cleared, so after Cmd+C on a selected range a later reflow settled on a verse and dropped the range. "
        + V
        + ": after a drag over 1:3-1:5 (or 1:30-2:2), Cmd+C, Shift and a narrower window leave the range and its blue. Tests: src/features/reader/use-reading-scroll.test.ts, e2e/ranges.spec.ts ('keys that do not scroll leave a selected range alone').",
    ],
)

# D4: keyboard and touch selection
add(
    "TXD-057",
    [
        "BUILT 2026-11-10 (lane R): a selection made by keyboard (Shift+arrows) or touch (a long press and its handles) makes a range as a mouse one does: a debounced selectionchange (300 ms) reports it once, ignored while a mouse button is down and outside the column. Deliberate difference: sefaria.org listens to mouseup only (static/js/TextColumn.jsx), so there such a selection makes no range ("
        + V
        + "). Tests: src/features/reader/TextColumn.selection.test.ts, e2e/ranges.spec.ts (keyboard; phone context with the selection made by script, as Playwright cannot long-press to select).",
    ],
)

# D2: Daf Yomi address
add(
    "CAL-002",
    [
        "The Daf Yomi card (and /todays-daf-yomi) land on both amudim written by their segments (/Bekhorot.53a.1-53b.17, TXD-070). "
        + V
        + ": /todays-daf-yomi -> /Bekhorot.53a.1-53b.17 (28 lines blue); the card clicked inside the app shows /Bekhorot.53a-53b (same 28 blue). One rule here (the segment form); recorded as a difference. Tests: e2e/calendars.spec.ts.",
    ],
)

# R3: titles with a backslash
add(
    "RTE-027",
    [
        "Root cause of the backslash-title 404 (lane R, 2026-11-10): not the ref codec. h3 (inside TanStack Start, H3Event constructor) runs decodeURI on the pathname of the URL object it shares with srvx's NodeRequest; %5C becomes a backslash, which the URL setter turns into '/', so request.url itself reaches the router as .../Subject/Object (%2F is reserved and survives, which is why '/' titles work). Fix proposed for server/index.mjs (hand the app a request with its own URL) and the dev server; verified on a production build: the title answers 200.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
