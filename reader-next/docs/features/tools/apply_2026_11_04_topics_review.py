"""Topics lane, after the independent review (2026-11-04): Hebrew-interface typography of the landing and topic pages measured on
sefaria.org(.il) with a phone User-Agent and at 1280, the AI notice always in the page, the in-app hand-off of a 404 to Django, the
word cloud's bullets as sefaria.org actually places them. Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
IDS = [
    "TOP-003",
    "TOP-004",
    "TOP-005",
    "TOP-006",
    "TOP-007",
    "TOP-014",
    "TOP-017",
    "TOP-018",
    "TOP-020",
    "TOP-023",
    "TOP-025",
    "TOP-026",
    "TOP-028",
    "TOP-029",
    "TOP-036",
    "PRM-014",
]
for i in IDS:
    print(i, by[i]["name"])
V = " VERIFIED 2026-11-04 (www.sefaria.org / www.sefaria.org.il with Playwright, computed styles and CSS.getPlatformFontsForNode)."


def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


add(
    "TOP-003",
    [
        "Hebrew interface faces (sefaria.org.il): the page title 30px/600 Heebo on a phone (the new reader now loads Heebo 600; it drew the 700 face, 4px wider); 'Explore all Topics ›' (לדפדוף בכל הנושאים) is a 14px span in the HEBREW SERIF (it inherits the column's serif, only English is set to sans) on an 18px line, 21px tall; the portion's 'Browse All Torah Portions' and the calendar's 'Explore the Jewish Calendar' links keep the English serif line (Cardo stack, 16px → 21px tall), the reading link the 18px serif line (23px) — the new reader had Heebo there (the global :lang(he) rule) and each row grew 2–3px."
        + V,
    ],
)
add(
    "TOP-004",
    [
        "The search box's face in the Hebrew interface: Heebo 24px/500 on a wide screen, the English sans (Roboto) 14px/500 on a phone — not the serif of the English page (the new reader had the Hebrew serif). The magnifier is /static/icons/search_mdl.svg at every size (the old SearchButton), not the iconmonstr magnifier."
        + V,
    ],
)
add(
    "TOP-005",
    [
        "Bullets as sefaria.org actually shows them: WordSalad places them ONCE, in a useEffect when the random sample arrives, often before the web fonts are in; when the fonts land the lines re-wrap and nothing re-places them. Over four loads (2026-11-04) 1–2 of ~40 bullets ended a line ('Shavuot •') — a single pass on the final, bullet-less lines would differ in 6–20 places, the same-line rule on the final lines in 1–2. The new reader keeps the same-line rule on the final lines (reproducible; the closest to what live shows); a trailing bullet on live is timing, not a rule."
        + V,
    ],
)
add(
    "TOP-006",
    [
        'Hebrew interface: the description is the HEBREW SERIF (the old .reactMarkdown div inside the Heebo span: "Noto Color Emoji", "EnglishInHebrew Serif Font", Cardo, "Taamey Frank"…), 16px — Heebo made a description one line longer on a phone (4 lines instead of 3) and the page 43px taller; the title span is a flex box, so the title row is Taamey Frank\'s own 32px line, not the h3\'s 34px serif strut.'
        + V,
    ],
)
add(
    "TOP-007",
    [
        "The Sign Up button keeps the English sans (Roboto stack) in the Hebrew interface — the Hebrew glyphs fall back to the system's — while the inputs are Heebo."
        + V,
    ],
)
add(
    "TOP-014",
    [
        "Hebrew interface: the filter box's input is Heebo (the new reader had the Hebrew serif)." + V,
    ],
)
add(
    "TOP-018",
    [
        "Hebrew interface: the dedication's markdown is a BLOCK in the Hebrew serif (the old .reactMarkdown div), its link too (Taamey Frank, 22px tall); the new reader had an inline span with a Heebo link, 8px taller."
        + V,
    ],
)
add(
    "TOP-025",
    [
        "Hebrew interface: the side picture sits on a serif text line (its descent under the image), as in English — on a Heebo line it was 1px deeper and moved the column down."
        + V,
    ],
)
add(
    "TOP-026",
    [
        "Hebrew interface: the readings' blocks and links keep the English serif lines (date row 21px, ref row 26px); Heebo made each row 1–2px taller."
        + V,
    ],
)
add(
    "PRM-014",
    [
        "Hebrew interface: the banner's text and buttons stay in the English sans (Roboto; the Hebrew glyphs from the system's fallback face), 19px lines — not Heebo (24px lines), which made the strip 9px taller and moved every Hebrew desktop page down (the 2–14% whole-page diffs on the topics pages)."
        + V,
    ],
)
add(
    "TOP-017",
    [
        "Hebrew interface on a phone: Hebrew text in the page inherits the serif where the old page set no face; the new reader's global `:lang(he) { Heebo }` had turned unstyled rows (citations, links inside serif blocks) into Heebo lines 2–3px taller. Fixed per element (citation row, landing links), not globally."
        + V,
    ],
)
add(
    "TOP-020",
    [
        "Hebrew interface: Works on Sefaria titles are 122% (29.28px, s2.css .navBlockTitle .int-he) in the Hebrew serif; on a phone the work keeps its 20px at the left (.interface-hebrew .authorIndex outranks the 450px reset). The new reader had 24px titles and no padding, so Rashi's list was 117px shorter."
        + V,
        "Hebrew interface on a phone (.interface-hebrew .singlePanel .tab.filter): the funnel and the 'א' sit 3px lower (margin-top 3px); the 1.3× scaled 'א' is 8.7px under the tab row's top on both sites after the port."
        + V,
    ],
)
add(
    "TOP-023",
    [
        "Hebrew interface: the source body keeps s2.css's HACK `.interface-hebrew .storyBody { direction: ltr; margin: 0 -17px 10px 26px }` — the body stays left-to-right with its 20px padding on the RIGHT, so Hebrew text wraps in a 287px column 51px from the left on a phone (the new reader mirrored it to 296px from x=45 and wrapped differently). Small print inside a text is the browser's `smaller` of the text's own size (15px in English, 18.33px in a 22px Hebrew text) and the text's own face (the new reader had 15px Heebo). The citation row is a serif line (44px with the 18px Taamey Frank citation), not Heebo's 46px."
        + V,
        "Known difference: sefaria.org never loads Taamey Frank Bold on the topic page (document.fonts reports it 'unloaded' after load), so <b> in a Hebrew source is the browser's synthetic bold of the Medium face, ~4px narrower per word than the real Bold the new reader loads (it preloads it for the reader's Talmud). Now and then a line wraps one word differently.",
    ],
)
add(
    "TOP-028",
    [
        "The AI notice (AiInfoTooltip) is ALWAYS in the page: the box with 'Learn More' (/ai, data-anl-event learn_more_click:click, data-anl-text learn_more) and 'Feedback' (formstack, feedback_click:click, feedback) is rendered hidden (.ai-message: opacity 0, visibility hidden, 180px back from the icon) and shown while the icon or the box is hovered (fade in 0.5s, out 2s); the box is 198px, #FBFBFA, radius 6, 14px/18px Roboto, links #4B71B7. The new reader rendered the links only on hover — anything scanning data-anl on load missed them; now as live."
        + V,
    ],
)
add(
    "TOP-029",
    [
        "GA4 events of the page (data-anl, ANL-015) as sefaria.org fires them: filter:click {text: <sort>} on the funnel, sort_by:click {text, from, to} on a sort option, search:input {text} in the filter box, lang_toggle_click on the A and lang_toggle_select {text, to: source|translation|sourcewtrans, from, feature_name: 'source lang toggled'} on a choice, each with the page batch {project: topics, content_lang, panel_category}. Tab clicks carry no data-anl attribute in the legacy TabView (TopicPage.jsx), so no declarative event. NEW READER: covered by e2e (topic-page.spec.ts 'the topic page's analytics').",
    ],
)
add(
    "TOP-036",
    [
        "NEW READER: the hand-off to Django also works after an in-app navigation: the topics routes' notFoundComponent (src/features/topics/DjangoHandoff.tsx) loads the address again from the server when the 404 was reached in the app (the document was loaded at another address, src/lib/routing/django-handoff.ts) — a related link, a description link, a card or ?editor=1 reached by navigation then gets Django's page when pass-through is on; the server's own 404 shows 'Page not found.' and never reloads. Before, TanStack's bare 'Not Found' showed and Django never got the request.",
        "Open: the backend change (get_topic's v2 answer carries `pools`) and its test (sefaria/helper/tests/topic_test.py::test_get_topic_v2_answers_the_topics_pools) have not been run (no Django/Mongo environment); until it is deployed, Library topics outside the A–Z list (~1,366) always go to Django.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"
st = json.load(open(S2))
st["TOP-028"] = {
    "status": "partial",
    "note": "AI marker (always in the page, as live), Admin tab, review, Generate, Publish built but never run in a moderator session; Add a source / Edit / Reorder open the old page (?editor=1 → Django via the 404 hand-off)",
    "by": "src/ui/TopicPage/TopicPage.tsx (AiNotice), src/features/topics/TopicPageRoute.tsx, src/lib/topics/topic-page-source.ts",
}
st["TOP-036"] = {
    "status": "done",
    "note": "In-app 404s reload to the server; the backend pools change is unverified (not run)",
    "by": "src/lib/topics/topic-page-source.ts (readTopicPage), src/features/topics/DjangoHandoff.tsx, src/lib/routing/django-handoff.ts, sefaria/helper/topic.py",
}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
