"""Wave 4, lane c-sidebar, 2026-11-10: parity S8-S11 (ranged connected texts, About this Text, the sidebar's Torah portions, the
Hebrew Resources panel), a11y S5 (sidebar part), N8, N10, and V-EXITS SB-05 (an in-page reopen refetched /api/related).
Idempotent: running it twice changes nothing."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))


def add(fid, lines):
    print(f"{fid}  {by[fid]['name']}")
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


add("CON-032", [
    "2026-11-10 (parity S8): a ranged connected text shows one paragraph per segment, 6px apart, as sefaria.org's TextRange (one block `.segment` each; VERIFIED: \"Abarbanel on Torah, Genesis 1:1\" = 1:1:1-3, three paragraphs). LinkedTextSide.parts. Tests: TextList.test.tsx, e2e/connections.spec.ts.",
])
add("CON-030", [
    "2026-11-10 (parity S11): connected texts are ordered in the sidebar's language (lang2), not the interface's, as the old TextList's contentLang (VERIFIED on sefaria.org.il: Genesis 1:1 with=Commentary, lang2=en starts with Abarbanel on Torah, lang2=he with Avi Ezer). Test: e2e/connections.spec.ts.",
])
add("CON-039", [
    "2026-11-10 (parity S9): the current versions are the ones the text shows (the old currObjectVersions): bilingual and Hebrew show 'Current Version' (the source on screen, named in the address or not) before 'Current Translation'; English text shows no Current Version, Hebrew text no Current Translation (VERIFIED on sefaria.org, Genesis 1:1). Type as sefaria.org: title 24/29 black, category 16/19 #666 2px, description 16px/19px #666 (Heebo 19.52px in Hebrew) 15px above and below, Composed 14/18 #6f6f6f. In the Hebrew interface the box shows the Hebrew title, description and composition whatever lang2 is. Region names in the interface's language. Tests: e2e/about.spec.ts.",
])
add("VER-006", [
    "2026-11-10 (parity S9): the source version on screen is 'Current Version' in bilingual and Hebrew even when the address names none (was: only with vhe=).",
])
add("BOK-006", [
    "2026-11-10 (parity S9): in the Hebrew interface the description falls back to the short Hebrew one (heShortDesc) before English, as the old AboutBox (Berakhot: \"ברכות ותפילות, בדגש על קריאת שמע…\"); BookPage takes description.heShort, which BookRoute must pass (requested from lane a-route).",
])
add("BOK-009", [
    "2026-11-10 (parity S10): the sidebar's Torah portions lay out as on sefaria.org and the book page: 'Torah Portions' 16px #666 30px under the chapters, two 50% columns of 61px rows, a 24px serif name over inline 14px/30px aliyot (#6f6f6f, the reader's in the brand blue); 392px for Genesis, as live (was 2008px of 50px tiles). Test: e2e/toc.spec.ts.",
])
add("CON-012", [
    "2026-11-10 (parity S11, a11y S5): section headings in legacy's words (connection_panel_section.* of static/js/sefaria/i18n/interface: מקורות לעיון, עזרים, כלים; src/lib/connections/strings.ts, held to those files by strings.test.ts); sections and the new-tab icon named in the interface's language.",
])
add("CON-019", [
    "2026-11-10 (parity S11): no EN tag in the Hebrew interface (sefaria.org.il: `.englishAvailableTag` computes display:none).",
])
add("CON-070", [
    "2026-11-10 (a11y S5, N8): the panel, Close and the language button are named in the interface's language; the language button says what it does (\"Show in Hebrew\" / \"Show in English\"; was \"Hebrew Language Toggle Icon\").",
])
add("VER-009", [
    "2026-11-10 (a11y S5, N10): Preview and Select are named in Hebrew in the Hebrew interface; a version's long bare link wraps inside its column (at 320px it ended 1.5px past the screen).",
])
add("CON-071", [
    "2026-11-10 (V-EXITS SB-05): the Resources request (/api/related) is no longer aborted when the sidebar pane unmounts: opening the sidebar mounted the pane twice and sent it twice (the first aborted), and closing the sidebar while it loaded made the next opening fetch it again. It now finishes into the cache; an in-page reopen sends nothing. A reload still refetches (connections memory-only, CODE_REVIEW R-10). Test: related.test.ts.",
])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
