"""The single topic page (/topics/<slug>, /topics/b/<slug>) ported to the new reader on the Library host, surveyed against the legacy code
(TopicPage.jsx, Story.jsx, sefaria.js getTopic / processTopicsTabsData, Misc.jsx TabView / FilterableList / LangSelectInterface,
reader/views.py topic_page, s2.css) and www.sefaria.org (desktop 1280, phone User-Agent, Hebrew interface). Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
IDS = [
    "TOP-001",
    "TOP-015",
    "TOP-016",
    "TOP-017",
    "TOP-018",
    "TOP-019",
    "TOP-020",
    "TOP-021",
    "TOP-022",
    "TOP-023",
    "TOP-024",
    "TOP-025",
    "TOP-026",
    "TOP-027",
    "TOP-028",
    "TOP-029",
    "TOP-030",
    "TOP-031",
    "TOP-035",
    "RTE-030",
]
for i in IDS:
    print(i, by[i]["name"])
V = " VERIFIED 2026-11-04 (www.sefaria.org with Playwright)."


def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


def new(fid, **f):
    """Add a feature once (the next free TOP number); later runs leave it as it is."""
    if fid in by:
        return
    base = by["TOP-015"]
    entry = {"id": fid, "area": base["area"], "audience": "all", "platform": "all", "status": "live", **f}
    last = max(i for i, x in enumerate(atlas) if x["id"].startswith("TOP-"))
    atlas.insert(last + 1, entry)
    by[fid] = entry
    print(fid, entry["name"], "(new)")


add(
    "TOP-001",
    [
        "Topic page address: the old ReaderApp writes topics/<slug> (topics/b/<slug> for the test version) then &sort=<topicSort> (always: reader/views.py passes GET sort or 'Relevance') then &tab=<tab> once TabView mounts (replacing the entry): /topics/moses → /topics/moses?sort=Relevance&tab=notable-sources; an author → ?sort=Relevance&tab=author-works-on-sefaria. A ?tab= in the address on load is IGNORED (the topic page's props carry no tab; TabView falls back to the first tab and writes it), ?sort= is honoured; the order of the parameters is rewritten. A tab click pushes a history entry, a sort click too. /topics/b/<slug> renders the same page. An unknown slug is Django's 404 ('Page Not Found | Sefaria'). Page title '<title> | Texts from the Sefaria Library' (he '<title> | מקורות מתוך ספריית ספריא'); description 'Jewish texts about <title in the interface language> from Torah, Talmud and other sources in Sefaria's library. <description>' — in English in the Hebrew interface too (the Hebrew msgstr is obsolete, #~ in locale/he)."
        + V,
        "NEW READER (2026-11-04): every Library /topics path is rendered by reader-next ('topics' has no Django rule left in src/lib/routing/django-paths.ts; route-manifest treats /topics/ as the client's): src/routes/topics.$.tsx and topics.b.$.tsx. The slug is normalised as normalize_slug. The address is written byte for byte as above, except that a ?tab= naming one of the page's tabs is honoured on load (a shared link to Sources opens Sources; an unknown tab still becomes the first). The Voices host keeps every /topics page on Django (Q-E1).",
    ],
)
add(
    "RTE-030",
    [
        "NEW READER: as TOP-001 — /topics/<slug> and /topics/b/<slug> are reader-next's on the Library host since 2026-11-04."
    ],
)
add(
    "TOP-015",
    [
        "Requests seen on sefaria.org: GET /api/v2/topics/<slug>?annotate_time_period=1&ref_link_type_filters=about|popular-writing-of&with_html=1&with_links=1&annotate_links=1&with_refs=1&group_related=1&with_indexes=1 (an author directly under Authors: ref_link_type_filters=popular-writing-of — Rashi, Jonathan Sacks); a parasha adds /api/calendars/next-read/<parasha>; a portal topic /api/portals/<portal_slug>; then /api/bulktext/<refs>?asSizedString=true&minChar=500&maxChar=600 for every 70 refs of every source tab, one after another (Moses: 17 requests). The topic answer is 683 KB for Moses (9 s uncached). get_topic sorts the sources by the request's interface language (sort_and_group_similar_refs)."
        + V,
        "NEW READER (src/lib/topics/topic-page-source.ts): the server reads the topic (with the reader's interfaceLang cookie, a 30 s deadline) and trims it to what the page uses (sheets dropped — the Library never lists them), adds the category above the topic, its parents' slugs and its category's subtopics from the server's topics TOC, and each source's book, categories and primary category from the server's catalogue (the old client had both in data.js / the 3.5 MB index); the page gets one server-function answer (memory only, 5 minutes). The first 70 texts of the tab shown, the next reading and a portal are fetched in the loader, so the server's HTML has the page; the rest in the browser.",
    ],
)
add(
    "TOP-016",
    [
        "Notable = an 'about' link whose description in the interface language has a title or a prompt and is not published:false; so the Hebrew interface's Notable Sources are the Hebrew-curated ones. Sources = notable + the rest, titled 'All Sources' when only notable ones exist. Top Citations = popular-writing-of. Admin (moderators) = a copy of Sources. Library: links with is_sheet never make a tab."
        + V,
        "NEW READER: bucketTabs / visibleTabs in src/lib/topics/topic-page.ts (unit-tested).",
    ],
)
add(
    "TOP-017",
    [
        "Geometry (1280): .content padding-top 60 under the banner; the column .storyFeedInner 760px centred beside the 420px side column (50px margins, 40px padding: text from x=90, 680 wide); h1 30px/500 with the English title 40px serif (Hebrew 36px), 5px under; the category 16px Roboto #666 uppercase 0.1em, 15px under; the description 16px Roboto black (links #4B71B7 to https://www.sefaria.org/topics/…), 15px under; Hebrew description's markdown block in the Hebrew serif face. Phone: 25px under the header, 25px side padding, h1 without margin, the picture centred under the description (≤66.67vw, caption 12px centred 80vw, 30px under)."
        + V,
        "AiInfoTooltip (outline 24px) beside the title when an about-link has a published ai_title in the interface language: hover box with 'Some of the text on this page has been AI generated.' + Learn More (/ai) and Feedback (formstack). NEW READER: ui/TopicPage TopicHeader + AiNotice.",
    ],
)
add(
    "TOP-018",
    [
        "The dedication (#FBFBFA, 26px 19px, 18px #666 italic garamond; Hebrew in the Hebrew serif face with a #4B71B7 link), 27px under; shown only when the topic has a ref. NEW READER: TOPIC_SPONSORSHIPS in src/lib/topics/topic-page.ts."
        + V
    ],
)
add(
    "TOP-019",
    [
        "Buttons: #18345D, 20px garamond (Hebrew Taamey Frank on a 19px line), 8px 16px, radius 7, the 20px inverted book icon; 5px over, 40px under; the Study Companion 10px after (0 under 900px), English interface only, data-anl-promotion_name 'Parashah Email Signup - Parashah Page'. Read the Portion links /<ref.url> (Genesis.1.1-6.8); a holiday shows its ref (Hebrew without geresh/gershayim)."
        + V
    ],
)
add(
    "TOP-020",
    [
        "Tabs: 22px Roboto (phone 16px, the active one 18px padding-bottom), 10px padding, 30px apart, the active one black with a 4px #CCC underline, the others #666; a 1px #CCC rule under the row, 18px under it. Pseudo-tabs at the far end: the funnel (18px filter.svg, data-anl-event filter:click, data-anl-text=<sort>) on every tab but Notable Sources and Works; the 'A' (Hebrew 'א', scaled 1.3) on every tab but Works, opening a 266px popover Source / Translation / Source with Translation (default: the interface language — English: Translation). Works on Sefaria: titles 24px serif on a 1.3 line (15px over, 8px under), descriptions 14px/18px #666 (Hebrew interface: Heebo 122% on a 24px line, the English fallback too), two to a row, one on a phone."
        + V,
        "NEW READER: TopicTabs (role=tablist holds only the tabs; the funnel and the A are buttons beside them), AuthorWorks, arrow keys move between tabs. The content language choice is the page's own state (not in the URL), as before.",
    ],
)
add(
    "TOP-021",
    [
        "NEW READER: SourceTab in src/features/topics/TopicPageRoute.tsx — chunks of 70 (URLs split under 3,800 characters as partitionArrayForURL) fetched one after another, 20 shown and 20 more when a sentinel nears the viewport; the count shown per topic and tab is kept for the session (back to the page, the list is as long)."
    ],
)
add(
    "TOP-022",
    [
        "Filter bar: a 250px #EDEDEC box (5px radius, the magnifier) with placeholder 'Search' (data-anl-event search:input), 'Sort by' + the options as 7px #EDEDEC pills, the chosen one black (data-anl-event sort_by:click with {text, from, to}). The sort applies to every source tab, Notable Sources included (?sort=Chronological on load). The filter resets when the tab changes; the bar's open state does not."
        + V,
        "NEW READER: refSort / refMatches (unit-tested); a sort click writes ?sort= (a new history entry).",
    ],
)
add(
    "TOP-023",
    [
        "Card: box-shadow 0 1px 3px rgba(0,0,0,.25), 20px apart; summary #FBFBFA 20px padding, the 14px arrow, title 16px/600 Roboto (Hebrew 18px Heebo), the book's primary category upper-cased at the end (16px serif); prompt #F0F7FF 20px padding under a 1px #CCC rule; text 18px serif on a 1.6 line (Hebrew 22px), justified, 20px from the top and the end; citation 18px garamond #666 (Hebrew Taamey Frank) with 20px under; a 4px category-colour bar at the start of each block. Only the first curated source is open. A source missing the chosen language is not shown on Notable Sources and Sources (its analytics wrapper stays, empty); on Top Citations it shows in the language it has. Body and citation link to /<normRef> (legacy encodes the book: /Zohar%2C_Shemot.51.376)."
        + V,
        "NEW READER: ui/TopicPage/SourceCard; per-source data-anl-batch {position, ai, item_id, content_id, content_type} as before.",
    ],
)
add(
    "TOP-024",
    [
        "On the Library host there is no Sheets tab (only the Voices host buckets is_sheet links). NEW READER: not built — the Voices host's topic pages stay Django's."
    ],
)
add(
    "TOP-025",
    [
        "Side column: 420px #FBFBFA (80px of grey above its top); sections 44px in; h2 15px uppercase #666 with its 22px Roboto title, 30px over (0 for the first), 10px padding and a 1px #CCC rule; lists 18px garamond on 26px lines; ten links then More / Less (16px Roboto #666). The picture: 332px + border, the 12px caption 6px under it (an inline image). 'Lived' shows the time period's name and year range ('1040 – 1105 CE'). Group order: 'Related' first, then alphabetical by the SINGULAR title (Parent before Parent-in-Law although 'Parents' is shown). With no displayable group the old fallback maps the category's first 20 subtopics to objects without shouldDisplay, which its own filter then drops: a titled, empty section (kept). Phone: under the page, the old 420px + 25px padding cut at the screen's edge."
        + V,
        "Found: in the Hebrew interface the Learn More links read 'undefined' on sefaria.org (Sefaria._ returns nothing for topic_page.wikipedia etc. there). NEW READER shows the Hebrew names (ויקיפדיה, האנציקלופדיה היהודית, הספרייה הלאומית) — a deliberate difference.",
        "NEW READER: ui/TopicPage/TopicSide TopicSideColumn, sideSections / learnMoreLinks in src/lib/topics/topic-page.ts; related topics are routed links (they open in the app).",
    ],
)
add(
    "TOP-026",
    [
        "Readings: 'October 30, 2027' • '29th of Tishrei, 5788' (14px italic Roboto #6F6F6F; hebcal's render / renderGematriya 'כ״ט תִשְׁרֵי תשפ״ח'), Torah / Haftarah labels 16px #666 0.1em, the 18px book icon and 18px garamond links, the aliyot 1–7 and M as 14px #6F6F6F links on a 30px line 25px in. NEW READER: the Hebrew date from the platform's Hebrew calendar (ICU) with hebcal's month names, no hebcal dependency."
        + V
    ],
)
add(
    "TOP-027",
    [
        "A portal topic (Jonathan Sacks → portal 'sacks') replaces the side column with the NavSidebar: About (title, picture with 'Credit: …' caption, markdown), Mobile, Organization, Newsletter, an empty Promo slot, the sidebar footer (sticky). Inside .topicPanel the modules' h1 take the topic page's h1 rules: a 40px serif title in a 22px/500 line with a 1px #CCC rule. Phone: 30px of grey over it; the picture centred two thirds wide."
        + V,
        "NEW READER: PortalModules + SidebarFooter; the newsletter module uses the topics landing form and posts to /api/subscribe/<email> and /api/subscribe/steinsaltz/<email> (the old NewsletterSignUpForm's layout is not reproduced).",
    ],
)
add(
    "TOP-028",
    [
        "NEW READER (moderators, is_staff): the Admin tab, the per-language review buttons (POST /api/ref-topic-links/<normRef> with the link's own description and review_state 'reviewed'), Generate (POST /api/topics/generate-prompts/<slug>, alert) and Publish (POST /api/ref-topic-links/bulk, confirm and reload), all through lib/auth/http (CSRF) — never exercised against production. The old editors (Add a source → SourceEditor, Edit → TopicEditor, Reorder sources → ReorderEditor, the pencil per source) are not built: their buttons reload the page with ?editor=1, which this client hands to Django (the old page with its editors).",
    ],
)
add(
    "TOP-029",
    [
        "Root batch {project:'topics', content_lang:<english|hebrew|bilingual from the language toggle>, panel_category:<parents' slugs joined by '|'>} (left out when the topic has no category); the side column data-anl-panel_type='topics' data-anl-panel_number=0."
        + V
    ],
)
add(
    "TOP-030",
    [
        "NEW READER: the topic page's rules (tab bucketing, refSort, refFilter, card display, link groups, Learn More, readings dates, sponsorships, admin link selection, normalize_slug) are src/lib/topics/topic-page.ts, unit-tested."
    ],
)
add(
    "TOP-035",
    [
        "NEW READER: links to a single topic (Trending Topics, cards, the landing page's cloud, cards and search) are routed since the topic page port."
    ],
)

new(
    "TOP-036",
    group="Topic page",
    name="Topic page Library pool check",
    summary="A topic page exists on the Library only for topics in the Library's pool; the new reader decides it from the A–Z list or the topic's pools, and otherwise lets Django answer.",
    details=[
        "Legacy: reader/views.py topic_page answers 404 when the topic does not exist or get_topic_pool_name_for_module(active_module) is not in topic.get_pools(); noindex unless should_display(min_sources=3, textual_only=True)."
        + V,
        "NEW READER: a slug in the server's A–Z list (/api/topics?limit=0: library pool, displayable, ≥3 text sources or a description) renders; otherwise the v2 topic's `pools` decide (added to get_topic's v2 answer on this branch, sefaria/helper/topic.py); where the API gives no pools (sefaria.org today) the route answers 404 and the server hands the request to Django, which renders the old page or its 404. noindex is the same test on the topic's fields.",
    ],
    refs=["reader/views.py:3592-3640", "sefaria/helper/topic.py get_topic"],
    src="inv_05_library_topics.md",
    tier="core",
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"
st = json.load(open(S2))


def done(by_):
    return {"status": "done", "by": by_}


st["TOP-001"] = done("src/routes/topics.*, src/features/topics/topic-page-route.ts, src/lib/routing/django-paths.ts")
st["RTE-030"] = done("src/routes/topics.*")
st["TOP-015"] = done("src/lib/topics/topic-page-source.ts, src/features/topics/TopicPageRoute.tsx")
st["TOP-016"] = done("src/lib/topics/topic-page.ts (bucketTabs)")
st["TOP-017"] = done("src/ui/TopicPage/TopicPage.tsx (TopicHeader, AiNotice)")
st["TOP-018"] = done("src/lib/topics/topic-page.ts (TOPIC_SPONSORSHIPS), src/ui/TopicPage/TopicPage.tsx")
st["TOP-019"] = done("src/ui/TopicPage/TopicPage.tsx (TopicHeader)")
st["TOP-020"] = done("src/ui/TopicPage/TopicPage.tsx (TopicTabs, AuthorWorks)")
st["TOP-021"] = done("src/features/topics/TopicPageRoute.tsx (SourceTab)")
st["TOP-022"] = done(
    "src/lib/topics/topic-page.ts (refSort, refMatches), src/ui/TopicPage/TopicPage.tsx (SourceFilterBar)"
)
st["TOP-023"] = done("src/ui/TopicPage/SourceCard.tsx")
st["TOP-024"] = {
    "status": "partial",
    "note": "No Sheets tab on the Library (as before); the Voices host's topic pages stay Django's",
    "by": "src/lib/routing/django-paths.ts",
}
st["TOP-025"] = done("src/ui/TopicPage/TopicSide.tsx (TopicSideColumn), src/lib/topics/topic-page.ts")
st["TOP-026"] = done("src/ui/TopicPage/TopicSide.tsx (Readings), src/lib/topics/topic-page.ts (hebrewCalendarDate)")
st["TOP-027"] = {
    "status": "partial",
    "note": "Modules built; the newsletter module uses the topics form, not the old NewsletterSignUpForm layout",
    "by": "src/ui/TopicPage/TopicSide.tsx (PortalModules)",
}
st["TOP-028"] = {
    "status": "partial",
    "note": "AI marker, Admin tab, review, Generate, Publish built; Add a source / Edit / Reorder open the old page (?editor=1 → Django)",
    "by": "src/features/topics/TopicPageRoute.tsx, src/lib/topics/topic-page-source.ts",
}
st["TOP-029"] = done("src/ui/TopicPage/TopicPage.tsx (TopicPageLayout)")
st["TOP-030"] = done("src/lib/topics/topic-model.ts, src/lib/topics/topic-page.ts")
st["TOP-031"] = done("src/lib/topics/topics-api.ts, src/lib/topics/topic-page-source.ts")
st["TOP-036"] = done("src/lib/topics/topic-page-source.ts (readTopicPage), sefaria/helper/topic.py")
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
