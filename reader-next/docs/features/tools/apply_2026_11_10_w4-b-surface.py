"""Wave 4, lane b-surface: reading surface parity (first screen, stacked spacing, phone gutter, section headings) and keyboard /
screen-reader behaviour of the reading panel (Escape, focus return, live region, Hebrew names, menu Tab wrap). Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))

V = "VERIFIED 2026-11-10 on www.sefaria.org (Playwright, read-only; reports/w4-b-surface.md)"


def add(fid, lines):
    """Append each line once."""
    print(fid, by[fid]["name"])
    d = by[fid]["details"]
    for l in lines:
        if l not in d:
            d.append(l)


# parity S4
add(
    "TXD-054",
    [
        "First screen with no verse to place (a section URL): "
        + V
        + ": the column opens scrolled past its top strip (90px), the section's title ~33-38px under the reader bar (Psalms 23 at 1280: title y=213, 23:1 y=283; Genesis 1: the book title strip scrolled out of view). FIXED 2026-11-10 (wave 4, b-surface): the rebuild showed the strip, and once the previous section loaded above it the end of that section (Psalms 22:31) sat where the strip had been. Now the inline script scrolls past the strip before first paint and the column keeps the section's title at the top of the text through the previous section loading, a short chapter growing, and the fonts, until the reader scrolls, presses a key or touches the page. Ours at 1280: Psalms 23 title y=212, 23:1 y=283; phone 390: below the sticky 60px reader bar (legacy's bar is not sticky). Tests: e2e/reader-surface-parity.spec.ts.",
    ],
)
add(
    "TXD-056",
    ["Since 2026-11-10 the top strip (book title / previous-section spinner) is scrolled out of view on a section's first screen, as on sefaria.org (TXD-054)."],
)

# parity S5
add(
    "TXD-034",
    [
        "Stacked "
        + V
        + " (Genesis 1:1 at 1280): Hebrew block 42.9px (the enlarged first letter's <big> has line-height 1.2), English 10px below, the next verse 20px below (the translation's bottom margin), Hebrew text-align right; segment 88.1px. FIXED 2026-11-10 (wave 4, b-surface): ours was 106.7px (a 20px Hebrew-English gap from a flex gap plus a margin, the first letter at the reader's 1.6 line-height, 26px between verses, Hebrew justified); now 88.1px with the same gaps. Tests: e2e/reader-surface-parity.spec.ts.",
    ],
)

# parity S6
add(
    "TXD-046",
    [
        "Phone "
        + V
        + " (Berakhot 2a, Hebrew, 390px): numbers at x=356-386, dots at 4-34, no sideways scroll. FIXED 2026-11-10 (wave 4, b-surface): on a phone the rebuild placed them 48px out (past the screen's edge; the page was 425px wide) and stepped colliding numbers further out; now 4px from the edges, and a step that would leave the text's surface goes inwards. No page scroll at 320, 360, 390, 414px in either interface. Tests: e2e/reader-surface-parity.spec.ts, e2e/continuous-numbers.spec.ts.",
    ],
)
status["TXD-046"] = {
    "status": "done",
    "note": "Gutter placement matches (phone: 4px from the edges); collisions step apart, inwards where outwards would leave the text (live's fix misplaces them)",
    "by": "src/ui/Segment/Segment.module.css, src/lib/reader/spread-numbers.ts",
}

# parity S7, S13
add(
    "TXD-011",
    [
        "Section headings "
        + V
        + ": Berakhot 2a 'ב׳ א' (Hebrew), Zohar 'Bereshit, Chapter 1' / 'בראשית, א׳', Siddur Ashkenaz 'Weekday, Shacharit, Preparatory Prayers, Modeh Ani', Guide for the Perplexed 'Part 1, Chapter 1', Mishneh Torah 'Chapter 1' / 'א׳', Shulchan Arukh 'Siman 1'. FIXED 2026-11-10 (wave 4, b-surface): the rebuild printed 'ב.' for a daf and the full ref ('Zohar, Bereshit 1', 'Siddur Ashkenaz, Weekday, …', 'Shulchan Arukh, Orach Chayim 1') outside the short-title categories; src/ui/TextSection/section-heading.ts ports Sefaria.sectionString. Tests: src/ui/TextSection/section-heading.test.ts, e2e/reader-surface-parity.spec.ts.",
    ],
)

# a11y S1
add(
    "SHL-071",
    [
        "FIXED 2026-11-10 (wave 4, b-surface, a11y S1): with the sidebar open, Escape inside the panel closes the sidebar only, from the sidebar or from the text, and the reader keeps its place (it closed the whole panel and went to /texts). "
        + V
        + ": Escape from a sidebar control closes only the sidebar (the sidebar is a panel of its own there). Deliberate difference: legacy's Escape on a verse with the sidebar open closes both and goes to /texts; here the first Escape closes the sidebar and a second closes the panel. Tests: e2e/reader-keyboard.spec.ts.",
    ],
)

# a11y S2
add(
    "I18-003",
    [
        "BUILT 2026-11-10 (wave 4, b-surface, a11y S2): closing the sidebar from inside it (Close, Escape) returns keyboard focus to the verse it was open on; closing one of several panels leaves focus on the panel beside it (its current verse); neither moves the text. Legacy leaves focus on <body> or the panel's Close link. Tests: e2e/reader-keyboard.spec.ts.",
    ],
)
status["I18-003"] = {
    "status": "done",
    "note": "New-panel focus; focus back to the verse when the sidebar closes and to the panel beside when one closes; sidebar focus on verse click intentionally not",
    "by": "src/features/reader/TextPanel.tsx",
}

# a11y S3, S5
add(
    "I18-005",
    [
        "BUILT 2026-11-10 (wave 4, b-surface, a11y S3): legacy's reader title is aria-live=polite; the rebuild has a polite live region in each text panel that names the section the reader has moved into (Hebrew in the Hebrew interface), once per section after 700ms in it, never per verse and not on arrival. Tests: e2e/reader-keyboard.spec.ts.",
    ],
)
add(
    "I18-013",
    [
        "BUILT 2026-11-10 (wave 4, b-surface, a11y S5): in the Hebrew interface the text panel's bar ('אפשרויות תצוגת טקסט', 'חזרה לספריה' / 'סגירת הטקסט', 'שמירת \"בראשית א׳\"', 'תפריט'), the section regions ('בראשית א׳') and the verse groups ('בראשית א׳:ג׳') have Hebrew accessible names (legacy's are English). The sidebar's names are not covered here. Tests: e2e/reader-keyboard.spec.ts.",
    ],
)

# a11y S9
add(
    "SHL-017",
    [
        "FIXED 2026-11-10 (wave 4, b-surface, a11y S9): Tab and Shift+Tab wrap inside the open menu as legacy's trapFocusWithTab does (Tab went on into the text behind it); Escape closes it and returns focus to the button (legacy drops it to <body>). Tests: e2e/reader-keyboard.spec.ts.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
