"""The topics navigation pages (/topics, /topics/category/<slug>, /topics/all/<letter>) ported to the new reader, surveyed against the
legacy code and www.sefaria.org (desktop 1280, phone User-Agent, Hebrew interface). Idempotent."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
IDS = [
    "TOP-001",
    "TOP-002",
    "TOP-003",
    "TOP-004",
    "TOP-005",
    "TOP-006",
    "TOP-007",
    "TOP-008",
    "TOP-009",
    "TOP-010",
    "TOP-011",
    "TOP-012",
    "TOP-013",
    "TOP-014",
    "TOP-030",
    "TOP-031",
    "RTE-030",
    "LIB-043",
    "SRC-098",
    "PRM-016",
    "PRM-017",
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
    base = by["TOP-031"]
    entry = {"id": fid, "area": base["area"], "audience": "all", "platform": "all", "status": "live", **f}
    last = max(i for i, x in enumerate(atlas) if x["id"].startswith("TOP-"))
    atlas.insert(last + 1, entry)
    by[fid] = entry
    print(fid, entry["name"], "(new)")


add(
    "TOP-001",
    [
        "Page titles (get_page_title + the client's document.title): /topics 'Topics | The Sefaria Library' (he 'נושאים | האוסף של ספריא'); a category '<title> | Texts from the Sefaria Library' (he '<title> | מקורות מתוך ספריית ספריא'); A–Z 'Explore Jewish Texts by Topic - <letter> | The Sefaria Library' (he 'עיון בארון הספרים היהודי לפי נושא - <letter> | האוסף של ספריא')."
        + V,
        "/topics/category/<unknown> and /topics/category (no slug) are Django 404 pages ('Page Not Found | Sefaria'); /people → 301 /topics/category/authors; /people/Talmud → /topics/category/talmudic-figures; /person/Rashi → /topics/rashi (the topic page then adds ?sort=Relevance&tab=author-works-on-sefaria)."
        + V,
        "NEW READER (2026-11-04): /topics, /topics/category/<slug> and /topics/all/<letter> are rendered by reader-next on the Library host (src/routes/topics.*); /topics/<slug>, /topics/b/<slug>, /people, /people/Talmud, /person/<name>, /sheets/tags[/<tag>] stay Django's (src/lib/routing/django-paths.ts DJANGO_TOPIC_PAGE and DJANGO_PREFIXES), so the legacy redirects still land on the new pages. An unknown category or a two-character letter is a 404, which the server hands to Django (its own 404 page).",
    ],
)
add(
    "TOP-002",
    [
        "NEW READER: the Library host's /topics is the landing page (reader-next); on the Voices host (voices.* / chiburim.* or PUBLIC_VOICES_ORIGIN's host, X-Forwarded-Host honoured) every /topics page passes through to Django (isDjangoPageForHost; the host model is undecided, Q-E1), so TopicsPage (TOP-011) is unchanged there.",
    ],
)
add(
    "TOP-003",
    [
        "Geometry (1280px): the column is 843px (.contentInner.topic-landing-page-content: 783px of content at x=39), the page's content starts 60px under the banner; the h1 is 32px/500 #666 centred; each section 60px under the one before (on a phone 18px for the search and 36px for the cloud, the h1 30px/600 with 10px under it). The sidebar is the library's (#FBFBFA, 420px); below 920px the old sidebar dropped under the column (sidebarLayout column), the new reader at 842px with the other library pages."
        + V,
        "Sidebar order: TopicLandingTopicCatList (Browse Topics: the 15 top-level TOC categories, unfiltered by module, 18px serif links on a 20px line), TrendingTopics, AZTopicsLink (a module whose h1 is the 'All Topics A-Z ›' link), Promo (empty unless the CMS fills it). Analytics: data-anl-project='topics', panel_name='Explore by Topic', panel_type='Topic Landing' on the whole panel (sidebar included); feature_name per section: Search, Topic Salad, Featured Topic, Multi-Cards, Parashah, Calendar; the newsletter's in its data-anl-batch."
        + V,
        "The old page fetched everything after mount (blank sections first); the new reader server-renders the search's count, Browse Topics, Trending, the featured topic and both calendar cards, and fetches only the random samples (cloud, cards) in the browser.",
    ],
)
add(
    "TOP-004",
    [
        "Search box: a 634x60 #EDEDEC pill (phone 344x47), the 18px magnifier 16px in, the input 24px/500 serif (phone 14px Roboto); suggestions in a 606px white drop-down 47px down, each 18px EB Garamond title + #333 '(Cat > Sub)' path, highlighted row #EDEDEC. The count is Sefaria.numLibraryTopics (5,768 today: the library pool's slugs, not the A–Z list's 4,402), grouped with ',' (toLocaleString)."
        + V,
        "NEW READER: the count comes from GET /api/topics/library-count (added on this branch) or, where that is missing, from the number the old /topics page writes into its props; the category paths from the server's topics TOC index (one server-function call, cached as catalog data). The topic page itself is still Django's, so choosing a suggestion is a full navigation to /topics/<slug>.",
    ],
)
add(
    "TOP-005",
    [
        "The cloud: .salad-container is a -webkit-box clamped to 5 lines in the font 'hide-ellipsis-char-font' (a zero-size face for U+2026 only), so the clamp's '…' is invisible; each item is a Roboto 22px link (40px line, 11px side margins) inside a nowrap span whose serif font sets the space and the '•' after it (margin-inline-start 0.2em). Bullets: an item gets one when the next item has the same offsetTop. Phone: RowedWordSalad, one horizontally scrolling row of #18345D pills (6px radius, 7px apart, white text)."
        + V,
        "NEW READER: the bullets are placed until the lines stop moving (a bullet can push the next item to the next line, which the old single pass left as a trailing bullet), again when the fonts arrive and on resize.",
    ],
)
add(
    "TOP-006",
    [
        "Featured Topic: h2 15px uppercase serif #666 with 30px over it; the picture (secondary_image_uri) 239px + a 1px #EDEDEC frame sitting on a serif text line (the block is 187px tall for a 181px picture); title h3 24px serif #666, 15px over the description (16px Roboto #666, links #4B71B7); a <br> then 'Go to Topic ›'. Phone: the header 22px, the picture full width with 10px under it. The answer is /_api/topics/featured-topic?lang=<en|he> (a different topic per interface language)."
        + V,
    ],
)
add(
    "TOP-007",
    [
        "Form: a #18345D band (36px 65px; Hebrew 36px 46px), the teaser h3 22px Roboto white, 256px wide (Hebrew 300px); inputs 13.33px (browser default) Roboto, 5px 12px, radius 6, the first of each row 16px before the next (so the email row's button sits 16px after it), rows 20px apart; Sign Up in blue on white. Phone: everything stacked, inputs and button 18px with 20px under each."
        + V,
        "Messages: names missing → 'Please enter a valid first and last name.'; bad email → 'Please enter a valid email address.'; then 'Subscribing...' (no Hebrew string), 'Subscribed! Welcome to our list.' / 'הרשמה בוצעה בהצלחה!' in white under the inputs; a failure shows under the band in italic #802F3E, right-aligned: the server's {error} message, 'Error posting to API' for a failed status, else 'Sorry, there was an error.'. The Hebrew interface subscribes to no list (lists left out of the payload).",
        "NEW READER: POST /api/subscribe/<email> through src/lib/auth/http (CSRF); the e2e test answers the POST itself (never production).",
    ],
)
add(
    "TOP-008",
    [
        "Cards: 248x361 on a wide screen (flex 1, 20px apart, content-box 345px + 12px + the 4px #18345D top), #FBFBFA, shadow 0 4px 4px rgba(0,0,0,.25); title 24px/1.1 Roboto clamped to 2 lines, 23px down and 30px in; description absolutely at 95px, 188px wide, ≤10 lines (8 in Hebrew); 'Explore <title> ›' (he 'למדו עוד על <title> ›') at 298px. The hrefs are relative ('topics/<slug>'). Phone: ten 268px cards in a scrolling row from a 1000-topic sample."
        + V,
    ],
)
add(
    "TOP-009",
    [
        "Layout: two columns 67px from a 1px #CCC divider (phone: stacked with the divider between); header 16px/500 Roboto #666; the card's title 24px Roboto; 'Learn More about …' 14px/18px #666; the reading (book icon + 18px link, its text in Roboto) 47px under; Read the Portion (.button.small blue, 147x39) 30px under; 'Browse All Torah Portions' 14px Roboto #4B71B7 on a 16px serif line, 14px under. The reading is Sefaria.calendars' Parashat Hashavua (the visitor's diaspora setting), the card from /api/calendars/topics/parasha?lang=<lang> (diaspora default)."
        + V,
    ],
)
add(
    "TOP-010",
    [
        "The date message is 14px/600 #333 on a serif line, the secondary topic's link inheriting its colour; the date 14px Roboto black, 19px under it; 'Explore the Jewish Calendar' like Browse All Torah Portions. When /api/calendars/topics/holiday fails or has no topic, the old card stays empty (rendered nothing)."
        + V,
    ],
)
add("TOP-011", ["NEW READER: not ported — the Voices host's /topics is passed to Django (TOP-002)."])
add(
    "TOP-012",
    [
        "Card (TOC grid): title 24px/1.3 Roboto black (15px over, 8px under), description 14px/18px #666 clamped to 3 lines with 20px end margin, links #4B71B7 unstyled; in the Hebrew interface both take Heebo at 122% and the description a 24px line — whatever the text's language (an English-only description in the Hebrew interface is Heebo, left-to-right, left-aligned: .int-he.enInHe in a -webkit-box)."
        + V,
        "Analytics quirk: TopicTOCCard passes analyticsEventName 'navto_topic:click' and Card appends ':click', so the attribute is data-anl-event='navto_topic:click:click' (the tracker reads it as navto_topic on click); analyticsLinkType is passed but never rendered. Kept byte for byte.",
    ],
)
add(
    "TOP-013",
    [
        "Geometry: the title row (CategoryHeader) keeps 15px under it and the h1 none, so the cards start 40px under the title's top; two columns 323px wide 20px apart at ≥900px and 600–700px, one column at 700–900px and below 600px (.contentInner .table); a 1px #EDEDEC line over the first row. Sidebar: AboutTopics, (StudyCompanion — torah-portions, English interface only), Promo, TrendingTopics, SponsorADay; data-anl-panel_category is the parents' slugs joined by '|' or 'Topic Landing' for a top-level category."
        + V,
        "NEW READER: the subtopics come from the server's topics TOC (GET /api/topics-toc on this branch's Django; on sefaria.org that 404s and the server reads the same tree out of /data.js), handed to the page as its slice through a server function — the browser never downloads the tree. Not ported: the moderators' CategoryHeader buttons (add sub-category, edit, reorder) on topic categories.",
    ],
)
add(
    "TOP-014",
    [
        "Details found: the URL's letter is used as written, so /topics/all/A matches nothing ('There are no topics here.'); the Hebrew bar excludes only ך ן ף ץ, so final mem ם shows (23 letters); in the Hebrew interface the empty list reads 'טוען מידע...' (LoadingMessage's default Hebrew: heMessage='' is falsy). Filter box 285px + 10px padding each side (content-box), #EDEDEC pill, 18px serif input; letters 16px Roboto #666, 10px apart. Sidebar: Promo, TrendingTopics, GetTheApp, SupportSefaria."
        + V,
        "NEW READER: the letter's list is filtered and sorted on the server (the 2.9 MB /api/topics?limit=0 kept there for an hour) and server-rendered; the browser downloads the whole list only once a filter of two characters is typed.",
    ],
)
add(
    "TOP-030",
    [
        "NEW READER: the rules the navigation pages apply (shouldDisplayInActiveModule, sortTopicsCompareFn with its top-level 10000 bandaid, TopicTOCCard's titles, A–Z filtering and sort) are src/lib/topics/topic-model.ts, unit-tested."
    ],
)
add(
    "TOP-031",
    [
        "GET /api/topics/library-count → {count} (Sefaria-Project reader-next branch, 2026-11-04): the library pool's size, the new reader's numLibraryTopics. On sefaria.org it does not exist yet: api/topics/<slug> answers {} for it.",
        "NEW READER: src/lib/topics/topics-api.ts holds every topic endpoint with the old URLs byte for byte (pools uncached, trending/featured/calendar topics for the day, the topic itself with the old v2 parameters for the single-topic page next).",
    ],
)
add(
    "RTE-030",
    [
        "NEW READER: see TOP-001 — the landing, category and A–Z URLs are reader-next's on the Library host; the topic page and the legacy redirects are Django's."
    ],
)
add(
    "LIB-043",
    [
        "Module: 'Trending Topics' title, then 10 serif 18px links on a 20px line 10px apart, each data-anl-event navto_topic:click with link_type topic and its English title; wrapper feature_name 'Trending'. Rendered nothing until the list arrived."
        + V
    ],
)
add("SRC-098", ["NEW READER: built with the topics landing page (TOP-004)."])
add(
    "PRM-016",
    ["NEW READER: the topics landing newsletter (TOP-007) is built; the sidebar and static-page forms are not."],
)
add(
    "PRM-017",
    [
        "NEW READER: SponsorADay (donate.sefaria.org/sponsor[he]?c_src=NavSidebar-SponsorADay), GetTheApp (white .appButton with the iOS/Android icons) and StudyCompanion are built for the topics pages (src/ui/NavSidebar/TopicModules.tsx)."
    ],
)

new(
    "TOP-033",
    group="Topic categories and A-Z",
    name="Topics TOC delivery",
    summary="The topics pages read the topics table of contents, which the old site put in every page's data.js; the new reader keeps it on the server and sends each page its slice.",
    details=[
        "Legacy: templates/js/data.js writes DJANGO_DATA_VARS.topic_toc (library.get_topic_toc(): the whole tree with titles, displayOrder, pools, shouldDisplay, description and categoryDescription) into the 9.4 MB /data.<ts>.js every page loads; Sefaria.topicTocPage / topicTocCategories / isTopicTopLevel read it."
        + V,
        "GET /api/topics-toc (Sefaria-Project, 2026-10-06) serves the same JSON; sefaria.org answers 404 until it is deployed.",
        "NEW READER (src/lib/topics/toc-source.ts): the server fetches /api/topics-toc, or on a 404 /data.js (sent as the 'sefaria-node' user agent, which Django's language middleware never redirects), extracts topic_toc and keeps it an hour for all requests; pages get a category's entries, the top-level slugs and the category's path, or the slug → category-path index for the landing search, through server functions (cached as catalog data).",
    ],
    refs=["templates/js/data.js:8", "static/js/sefaria/sefaria.js:3240-3320", "reader/views.py topics_toc_api"],
    src="inv_05_library_topics.md",
    tier="core",
)
new(
    "TOP-034",
    group="Topics landing page",
    name="Library topic count",
    summary="The landing search says how many topics the library has.",
    details=[
        "Legacy: base_props numLibraryTopics = get_num_library_topics() (DjangoTopic.objects.get_topic_slugs_by_pool('library')), on every page's props; 5,768 on 2026-11-04 (the A–Z list has 4,402)."
        + V,
        "NEW READER: GET /api/topics/library-count (added on this branch); where it is missing, the server reads '\"numLibraryTopics\": N' from the old /topics page; without either the placeholder is 'Search Topics A-Z'.",
    ],
    refs=["reader/views.py:369", "sefaria/helper/topic.py:297-299"],
    src="inv_05_library_topics.md",
    tier="standard",
)
new(
    "TOP-035",
    group="Topic categories and A-Z",
    name="Topics pages' sidebar modules",
    summary="Each topics page has its own list of sidebar modules: Browse Topics, Trending Topics, All Topics A-Z, About Topics, Sponsor a Day, the Study Companion and Get the App.",
    details=[
        "Landing: TopicLandingTopicCatList, TrendingTopics, AZTopicsLink, Promo. Category: AboutTopics, (StudyCompanion on torah-portions in English), Promo, TrendingTopics, SponsorADay. A–Z: Promo, TrendingTopics, GetTheApp, SupportSefaria. Every list is followed by the sidebar footer."
        + V,
        "About Topics text (en/he) is inline in NavSidebar.jsx; Study Companion has no Hebrew strings (English only by design); 'Sign Up' links learn.sefaria.org/weekly-parashah/ with data-anl-event select_promotion:click|view_promotion:scrollIntoView and promotion_name 'Parashah Email Signup - Topic TOC'.",
        "NEW READER: src/ui/NavSidebar/TopicModules.tsx with the old data-anl-* attributes; links to a single topic leave the app (Django), links to a category or A–Z are routed.",
    ],
    refs=["static/js/NavSidebar.jsx:181-195,339-363,634-722,775-792"],
    src="inv_05_library_topics.md",
    tier="standard",
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"
st = json.load(open(S2))


def done(by_):
    return {"status": "done", "by": by_}


st["TOP-001"] = {
    "status": "partial",
    "note": "Landing, category and A–Z URLs rendered; the single topic page and the legacy redirects are Django's",
    "by": "src/routes/topics.*, src/lib/routing/django-paths.ts",
}
st["TOP-002"] = {
    "status": "partial",
    "note": "Library landing page built; the Voices host's /topics stays Django's (Q-E1)",
    "by": "src/server/pass-through.ts, src/lib/routing/django-paths.ts",
}
st["TOP-003"] = done("src/features/topics/TopicsLandingRoute.tsx, src/ui/TopicsNav/TopicsPages.tsx")
st["TOP-004"] = done("src/ui/TopicsNav/TopicLanding.tsx (TopicLandingSearch), src/lib/topics/topic-model.ts")
for i in ["TOP-005", "TOP-006", "TOP-007", "TOP-008", "TOP-009", "TOP-010"]:
    st[i] = done("src/ui/TopicsNav/TopicLanding.tsx")
st["TOP-012"] = done("src/ui/TopicsNav/TopicCard.tsx")
st["TOP-013"] = {
    "status": "partial",
    "note": "Page, cards, sidebar built; moderators' category buttons (add/edit/reorder) not built",
    "by": "src/features/topics/TopicCategoryRoute.tsx",
}
st["TOP-014"] = done("src/features/topics/AllTopicsRoute.tsx, src/ui/TopicsNav/AllTopics.tsx")
st["TOP-030"] = {
    "status": "partial",
    "note": "The navigation pages' rules; the topic page's are next",
    "by": "src/lib/topics/topic-model.ts",
}
st["TOP-031"] = {
    "status": "partial",
    "note": "Pools, trending, featured, list consumed; /api/topics/library-count added",
    "by": "src/lib/topics/topics-api.ts",
}
st["TOP-033"] = done("src/lib/topics/toc-source.ts")
st["TOP-034"] = done("src/lib/topics/toc-source.ts, reader/views.py num_library_topics_api")
st["TOP-035"] = done("src/ui/NavSidebar/TopicModules.tsx")
st["RTE-030"] = {"status": "partial", "note": "As TOP-001", "by": "src/routes/topics.*"}
st["LIB-043"] = done("src/ui/NavSidebar/TopicModules.tsx (TrendingTopics)")
st["SRC-098"] = done("src/ui/TopicsNav/TopicLanding.tsx (TopicLandingSearch)")
st["PRM-016"] = {
    "status": "partial",
    "note": "The topics landing newsletter only",
    "by": "src/ui/TopicsNav/TopicLanding.tsx (TopicNewsletter)",
}
st["PRM-017"] = {
    "status": "partial",
    "note": "SponsorADay, GetTheApp, StudyCompanion for the topics pages",
    "by": "src/ui/NavSidebar/TopicModules.tsx",
}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
