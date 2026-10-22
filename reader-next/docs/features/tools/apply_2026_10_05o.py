"""Typography and narrow-panel findings from the pixel parity run, 2026-10-05. Idempotent."""
import json, pathlib
T = pathlib.Path(__file__).resolve().parents[1]
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)
add("TXD-060", [
    "VERIFIED 2026-10-05 (Chrome platform fonts via CDP): Genesis 1 Hebrew on the live site is drawn in Taamey Frank CLM (computed stack: \"Noto Color Emoji\", \"EnglishInHebrew Serif Font\", Cardo, \"Taamey Frank\", adobe-garamond-pro, \"Crimson Text\", …) — the library theme override puts the Taamey-backed face BEFORE Cardo, which also has Hebrew glyphs. English text is drawn in Adobe Garamond Pro (Adobe Fonts); a few Latin characters in Hebrew runs come from Heebo.",
    "Citation links inside commentary (a.refLink): 0.8em of the text size, weight 700, letter-spacing 1px, colour #333, same face as the text.",
    "Rebuild notes: a global :lang(he) rule setting the UI face also matches every descendant of a Hebrew element and silently beat the text face — fixed by making segment text and its descendants inherit. English text is Cardo (open) instead of Adobe Garamond (licensed): lines break a few words earlier; owner decision recorded in docs/PARITY_SHOTS.md.",
])
add("TXD-061", [
    "VERIFIED 2026-10-05: text box geometry. Panel >= 760px: segments in a 700px column (30px padding each side of a max-width 760 box). Panel < 730px (class narrowColumn, ReaderPanel.jsx:1156 `width < 730`): an extra 26px padding on each side of the text, so at 390px the text runs x=56…334 and the segment number sits in the right gutter (x≈350). At 700px viewport the text is 588px wide. Between 730 and 760 the box is the 760 box. Text is justified (the .segmentText box; spans inside report left/right).",
    "Computed sizes (desktop, bilingual): Hebrew 26.84px / line-height 42.944px, English 22px / 35.2px, translation colour #666, Hebrew black; rebuild equal except colours (see PARITY_SHOTS).",
])
json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
