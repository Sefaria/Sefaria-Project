"""Atlas corrections and additions from building the reader's scrolling (2026-10-04).
Every claim marked VERIFIED was observed on www.sefaria.org with Playwright on that date. Idempotent."""
import json, pathlib
P = pathlib.Path(__file__).resolve().parents[1] / "features.json"
atlas = json.load(open(P))
by = {f["id"]: f for f in atlas}

def add_details(fid, lines):
    f = by[fid]
    for l in lines:
        if l not in f["details"]:
            f["details"].append(l)

def add(feature):
    if feature["id"] in by:
        by[feature["id"]].update(feature)
        return
    i = max(i for i, f in enumerate(atlas) if f["area"] == feature["area"] and f["group"] == feature["group"])
    atlas.insert(i + 1, feature)
    by[feature["id"]] = feature

# ── corrections ──────────────────────────────────────────────────────────────────────────────────────
by["TXD-050"]["summary"] = ("The segment being studied is marked with a light-blue background — but only while the connections "
    "sidebar is open. A plain verse or range link scrolls to the verse without a visible highlight.")
add_details("TXD-050", [
    "VERIFIED 2026-10-04: /Genesis.1.3 and /Genesis.1.3-5 with the sidebar closed show no .segment.highlight; with=all shows it (rgb(240,247,255)).",
    "VERIFIED 2026-10-04: the `highlightedRefs.length > 1` branch never shows a whole range in practice — the range URL collapses to its first segment about 1s after load (TXD-055), so with the sidebar open only that first segment is highlighted.",
])
by["TXD-055"]["summary"] = ("As you scroll, the URL follows the segment you are reading (segment level, e.g. /Genesis.1.8), the header "
    "follows the section, and — with the sidebar open — the blue highlight and the sidebar's connections follow too (TXD-067).")
add_details("TXD-055", [
    "VERIFIED 2026-10-04: the URL tracks to SEGMENT level while scrolling, with or without the sidebar (/Genesis.1.3 → /Genesis.1.8). Earlier atlas wording ('the section and segment') under-stated this.",
    "VERIFIED 2026-10-04: a section URL (/Genesis.1) stays section-level after load until the reader scrolls; a range URL (/Genesis.1.3-5) is replaced by its first segment (/Genesis.1.3) once the initial scroll settles (~1s), sidebar open or not.",
    "Focus rule detail: positions are measured from the top of the scrolling element; threshold 140 (multi-panel) / 70 (single panel); windowMiddle = window height / 2 (or /4 in mobile TextAndConnections).",
])
add_details("TXD-053", [
    "Rebuild note: the old client let the browser's native scroll anchoring (overflow-anchor) run alongside its own restoreScrollPositionAfterTopLoad; the rebuild disables native anchoring and keeps the reader's place itself (TXD-068).",
])
add_details("TXD-054", [
    "VERIFIED 2026-10-04: on load the old reader paints the top of the chapter first, then scrolls to the linked segment after hydration (a visible jump); the rebuild places it before first paint (TXD-068).",
])

# ── missing features ─────────────────────────────────────────────────────────────────────────────────
add({"id": "TXD-067", "area": "text-display", "group": "Scrolling",
     "name": "Current-segment highlight follows the reader",
     "summary": "With the connections sidebar open, the light-blue highlight moves from segment to segment as you scroll, and the sidebar's content follows the highlighted segment.",
     "details": [
        "VERIFIED 2026-10-04: /Genesis.1.3?with=all, scroll 400px → highlight moves to Genesis 1:8 and the URL to /Genesis.1.8; sidebar shows 1:8's connections.",
        "Same focus rule and 100ms debounce as TXD-055 (adjustHighlightedAndVisible → setTextListHighlight). Without the sidebar the focus is tracked (URL) but not painted.",
        "Clicking a segment makes it current (highlight + sidebar) without scrolling; it stays current until the reader scrolls.",
        "Previously documented only as one clause inside TXD-055; split out because it is a core reading behaviour.",
     ],
     "audience": "all", "platform": "all", "status": "live", "tier": "core",
     "refs": ["static/js/TextColumn.jsx", "static/js/ReaderPanel.jsx"], "src": "inv_03_text_rendering.md#5.3"})
add({"id": "RTE-064", "area": "routing", "group": "Reader query parameters",
     "name": "Query parameters rewritten on load (aliyot=0, lang2)",
     "summary": "After load the old reader rewrites the address bar's query string: Torah pages gain aliyot=0, and opening the sidebar adds lang2 (the sidebar's language).",
     "details": [
        "VERIFIED 2026-10-04: /Genesis.1?lang=en → /Genesis.1?lang=en&aliyot=0 (~0.7s after load); /Genesis.1.3-5?lang=en&with=all → …&lang2=bi then &lang2=en.",
        "Not ported: these are defaults written back into the URL, they add no information and make shared links noisy. The rebuild reads both parameters but only writes them when the reader changes them.",
     ],
     "audience": "all", "platform": "all", "status": "live", "tier": "retire",
     "refs": ["static/js/ReaderApp.jsx"], "src": "inv_01_urls_routing.md"})

# ── rebuild-only behaviour (not in the old client; listed so the atlas covers the new reader too) ────
add({"id": "TXD-068", "area": "text-display", "group": "Scrolling",
     "name": "Jump-free reading: place keeping and pre-paint placement (rebuild)",
     "summary": "In the rebuild, nothing you are reading ever moves unless you scroll: sections added above, fonts arriving, the sidebar opening, font-size and layout changes all keep the current segment still, and a linked verse is in place from the first visible frame.",
     "details": [
        "Anchor = current segment; corrections in the same task as the change (layout effect / ResizeObserver), only content shifts corrected, never the reader's own scroll.",
        "Pre-hydration inline script positions the linked verse during HTML parsing, keeps it in place every frame until the app takes over, and holds the text invisible (≤600ms) while web fonts arrive.",
        "The focus only moves when the reader moves, in the direction of travel (no backwards URL step near the end of a chapter).",
        "Tested by e2e/smoothness.spec.ts (per-step jump analysis) and scripts/jank-probe.mjs.",
     ],
     "audience": "all", "platform": "all", "status": "rebuild-only", "tier": "core",
     "refs": [], "src": "sefaria-reader: src/features/reader/use-reading-scroll.ts"})
add({"id": "TXD-069", "area": "text-display", "group": "Scrolling",
     "name": "Neighbouring sections preloaded with the page (rebuild)",
     "summary": "The server tells the browser to fetch the previous and next sections while the app is still loading, so scrolling past an edge right after arrival is instant.",
     "details": ["<link rel=preload as=fetch crossorigin> with the exact API URL the client requests (pinned by a unit test); the old client fetched neighbours only after mount."],
     "audience": "all", "platform": "all", "status": "rebuild-only", "tier": "standard",
     "refs": [], "src": "sefaria-reader: src/features/reader/reader-route.ts"})

json.dump(atlas, open(P, "w"), ensure_ascii=False, indent=1)
print(len(atlas), "features")
