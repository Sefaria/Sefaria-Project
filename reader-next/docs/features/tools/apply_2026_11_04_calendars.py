"""The calendars lane (2026-11-04): /calendars, /parashat-hashavua, /todays-daf-yomi ported to the new reader. Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
IDS = ["CAL-001", "CAL-002", "CAL-003", "RTE-010", "API-009", "LIB-050", "LIB-054", "LIB-026", "LIB-033", "LIB-031", "PRM-016", "LIB-038", "GUI-011", "ANL-015"]
for i in IDS: print(i, by[i]["name"])

def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)

def refs(fid, old, new):
    r = by[fid]["refs"]
    if old in r: r[r.index(old)] = new
    elif new not in r: r.append(new)

def new_feature(f):
    if f["id"] in by: return
    print(f["id"], f["name"], "(new)")
    # after the area's last feature
    idx = max(i for i, x in enumerate(atlas) if x["area"] == f["area"])
    atlas.insert(idx + 1, f); by[f["id"]] = f

# ---------------------------------------------------------------------------------------------------------------------------- CAL-001
refs("CAL-001", "reader/views.py:1326-1329", "reader/views.py:1340-1359")
by["CAL-001"]["details"] = [d for d in by["CAL-001"]["details"] if d != "Server view calendars (reader/views.py:1326-1329)."]
add("CAL-001", [
    "Server view calendars (reader/views.py:1356-1359): menu_page 'calendars', title 'Learning Schedules | Sefaria Library' (English in both interfaces), description 'Weekly Torah portions, Daf Yomi, and other schedules for Torah learning.' URL /calendars/? (re_path): '/calendars/' is a page too (200), and its canonical keeps the slash ('https://www.sefaria.org/calendars/'). VERIFIED 2026-11-04.",
    "Data: Sefaria.calendars = get_todays_calendar_items(**_get_user_calendar_params(request)) — diaspora from request.diaspora (cf-ipcountry), custom = the signed-in profile's settings.textual_custom (new profiles default 'sephardi'; missing → 'ashkenazi'), 'ashkenazi' when signed out. The day is the server's time zone (the API answered timezone 'America/Halifax' on 2026-11-04). The same items come from /api/calendars?diaspora=…&custom=… (no timezone). VERIFIED 2026-11-04.",
    "Sections keep the API's order (the page filters the API list by each section's names), and a section with no cards keeps its heading. VERIFIED 2026-11-04.",
    "Geometry (VERIFIED 2026-11-04, 1280px and phone User-Agent): headings 22px/500 dark grey, 30px over the cards (10px on a phone); page column 665px, its top 60px under the header/banner strip; sidebar modules: About Learning Schedules (multi-panel only), Stay Connected, Support Sefaria, an empty Promo module, the footer. On a phone the About module is the first thing on the page, its title without the rule, and the sidebar (Stay Connected, Support Sefaria, Promo, footer) follows 20px under the cards.",
    "BUILT 2026-11-04 (src/routes/calendars.tsx, src/features/calendars/CalendarsRoute.tsx, src/ui/CalendarsPage): server-rendered from /api/calendars with diaspora from CF-IPCountry and the reader's custom (src/features/calendars/textual-custom.ts: GET /api/profile/<slug> with the reader's cookie, owner-only settings, asked through a server function from the browser too; signed out 'ashkenazi'). Pixel diff against the live page 0.00% (1280 top/middle/bottom/full, phone full page). Tests: e2e/calendars.spec.ts.",
])
# ---------------------------------------------------------------------------------------------------------------------------- CAL-002
add("CAL-002", [
    "The subtitle's Hebrew strings (calendar_listing.talmud/tanakh) are empty and the brackets are drawn only under .interface-english: the Hebrew interface shows no subtitle. VERIFIED 2026-11-04.",
    "The API's own description wins over the table (the weekly portion's summary comes from the API). Yerushalmi Yomi is not in the table and has no description; Zohar for Elul appears only in season. Chok LeYisrael's url is a Hebrew collection path with a query ('collections/חק-לישראל?tag=Chayei%20Sara'), written into the href unencoded. VERIFIED 2026-11-04.",
    "Card geometry (VERIFIED 2026-11-04): two 327.5px columns 10px apart and rows 6px apart while the grid is wider than 500px (ResponsiveNBox threshold2), one column below; a 4px line in the category's colour (Sefaria.palette); title 24px serif on a 1.3 line, 15px over / 8px under, 20px short of the card's end; readings 18px serif dark grey, the 18px book icon 10px before, 2px apart, 16px over the description; description 14px/18px sans, 12px under the card. Hebrew interface: titles and descriptions at 122% (descriptions on a 24px line), readings in the Hebrew serif at 18px.",
    "BUILT 2026-11-04 (src/lib/library/calendars.ts calendarListings/sectionListings, src/ui/CalendarsPage CalendarCard): tests e2e/calendars.spec.ts, src/lib/library/calendars.test.ts, Storybook Pages/CalendarsPage.",
])
# ---------------------------------------------------------------------------------------------------------------------------- CAL-003
refs("CAL-003", "reader/views.py:2965-3023", "reader/views.py:3004-3048")
refs("CAL-003", "reader/views.py:3841-3861", "reader/views.py:3879")
refs("CAL-003", "reader/views.py:4679-4690", "reader/views.py:4758-4769")
add("CAL-003", [
    "Redirects: 302 with an empty body, Content-Type 'text/html; charset=utf-8', Vary 'Accept-Language, Cookie', Location = iri_to_uri('/' + item.url) of get_keyed_calendar_items() — today's items with diaspora=True and custom=None, whatever the request says: '?diaspora=0' is read and ignored. A title the API repeats goes to its last item (keyed dict). '/parashat-hashavua/' and '/todays-daf-yomi/' are 404s; on voices.sefaria.org both paths are 404s. VERIFIED 2026-11-04 (Location '/Genesis.23.1-25.18', '/Bekhorot.47').",
    "BUILT 2026-11-04 (src/server/calendar-shortcuts.ts, wired in src/start.ts): the node server answers the two shortcuts itself from /api/calendars?diaspora=1 with Django's status, headers and Location (iri_to_uri ported); when the API fails or the schedule is missing it hands the request to Django (pass-through) or answers 503. Voices host: passed to Django (a 404, as voices.sefaria.org, when the server has no Django to pass to). The APIs themselves stay Django's (every /api/ path is). Tests: e2e/calendars.spec.ts, src/server/calendar-shortcuts.test.ts.",
])
# ---------------------------------------------------------------------------------------------------------------------------- RTE-010
add("RTE-010", [
    "VERIFIED 2026-11-04: /calendars and /calendars/ are both pages (200); /parashat-hashavua and /todays-daf-yomi 302; their slashed forms 404.",
    "BUILT 2026-11-04: /calendars and /calendars/ render in the new reader (Library host); the router keeps a trailing slash the server lets through (trailingSlash 'preserve'); the shortcuts are answered by the node server (CAL-003). '/dayoflearningcalendar' is not part of this port (still Django's). Known differences: '/calendars//' answers the router's 307 to '/calendars/' (live 200), and '/Calendars' renders the page (live 404; the router matches paths case-insensitively, as for /Texts).",
])
add("API-009", ["2026-11-04: the /parashat-hashavua and /todays-daf-yomi redirects are answered by the new reader's server from /api/calendars (CAL-003); the endpoints stay Django's."])
# ---------------------------------------------------------------------------------------------------------------------------- sidebar modules
add("LIB-050", [
    "Geometry (VERIFIED 2026-11-04 on /calendars): the text, then the sign-up box 20px under it (a 40px field the module's width, no border, 0 1px 3px shadow, 6px corners, 15px #333 text, padding 10px 32px 12px 16px; Hebrew 8px 16px 11px 32px and 41px tall), the 18px arrow at 20% opacity 10px from the top and 12px from the end (mirrored in Hebrew); the three 40px white buttons (1px #ccc border, 6px corners, 18px icons) 12px apart, 22px under the box.",
    "BUILT 2026-11-04 (src/ui/NavSidebar StayConnected + src/ui/NewsletterSignUp): used on /calendars. Tests: e2e/calendars.spec.ts.",
])
add("LIB-054", [
    "Title 'Learning Schedules' / 'לוח לימוד יומי'. On the phone page it sits at the top of the page column with no rule under its title, 10px over its text, 34px over 'Weekly Torah Portion'. VERIFIED 2026-11-04.",
    "BUILT 2026-11-04 (src/ui/NavSidebar AboutLearningSchedules, wideOnly / phoneOnly). Tests: e2e/calendars.spec.ts.",
])
add("LIB-026", ["/calendars: the Promo module is the sidebar's last module (after Support Sefaria) on both layouts. VERIFIED 2026-11-04."])
add("PRM-016", [
    "Found 2026-11-04: StayConnected passes context='sidebar' but the form reads contextName, so its event is Newsletter / 'Subscribe from undefined'. The error shown is the API's `error` string untranslated, or 'Error posting to API' for a failed status; after an error the name fields close. The Hebrew 'please enter a valid first and last name' string is English. The email goes into the path unencoded (/api/subscribe/<email>).",
    "BUILT 2026-11-04 for the sidebar (src/ui/NewsletterSignUp, src/lib/user/newsletter.ts via lib/auth/http with the CSRF token; the same UA event, 'Subscribe from undefined'). Not built: the static pages, promotions and topic-landing uses (lists, Steinsaltz).",
])
# ---------------------------------------------------------------------------------------------------------------------------- new
new_feature({
    "id": "CAL-004", "area": "calendars", "group": "Learning schedules", "name": "Learning Schedules follow the reader's location and custom",
    "summary": "The page shows Israel's or the diaspora's weekly portion by the reader's country, and the haftarah of the reader's textual custom.",
    "details": [
        "request.diaspora: False when Cloudflare's cf-ipcountry is IL; an unknown country uses PINNED_IPCOUNTRY (sefaria/system/middleware.py LocationSettingsMiddleware). custom: profile settings.textual_custom when signed in (default 'sephardi' for new profiles; missing → 'ashkenazi'), 'ashkenazi' signed out (reader/views.py _get_user_calendar_params).",
        "The library pages' sidebar modules (LIB-038/039/040) are fed the same way on sefaria.org; the new reader's library sidebar still sends no custom (open).",
        "BUILT 2026-11-04 for /calendars (src/features/calendars/textual-custom.ts, src/lib/user/textual-custom.ts, calendarsQueryOptions(diaspora, custom)). Tests: e2e/calendars.spec.ts (CF-IPCountry IL: the server render's query cache asks for Israel's schedules), src/lib/user/textual-custom.test.ts, src/features/calendars/textual-custom.test.ts. The signed-in custom is unit-tested only (an e2e session would need production credentials); the browser asks through the server function, so it works where /api is not on the page's origin (dev, e2e).",
    ],
    "audience": "all", "platform": "all", "status": "live", "tier": "standard",
    "refs": ["reader/views.py:1340-1346", "sefaria/system/middleware.py:66-83"], "src": "2026-11-04 calendars lane",
})
new_feature({
    "id": "CAL-005", "area": "calendars", "group": "Learning schedules", "name": "Calendars refresh after a settings change",
    "summary": "When the account settings page changes the textual custom, the open page asks for the calendars again.",
    "details": [
        "templates/account_settings.html dispatches 'sefaria:settings-updated' {textualCustom, diaspora}; ReaderApp.handleSettingsUpdatedEvent calls Sefaria.updateCalendars(custom, diaspora) → /api/calendars?custom=…&diaspora=… and replaces Sefaria.calendars.",
        "New reader: the event invalidates every ['user', …] query (src/routes/__root.tsx refreshReader), which includes the textual custom; a changed custom changes the calendars query key, so the page refetches. The event's own diaspora value is not used (the page keeps the request's country). Test: src/features/calendars/textual-custom.test.ts (invalidating ['user'] refetches the custom; the schedules key follows it).",
    ],
    "audience": "signed-in", "platform": "all", "status": "live", "tier": "optional",
    "refs": ["static/js/ReaderApp.jsx:1266-1278", "static/js/sefaria/sefaria.js:3655-3662"], "src": "2026-11-04 calendars lane",
})

# ---------------------------------------------------------------------------------------------------------------- review fixes (same day)
add("CAL-001", [
    "Head (VERIFIED 2026-11-04, the same in both interfaces): og:title/twitter:title = the title, og:description/twitter:description, og:type website, og:image https://www.sefaria.org/api/img-gen/calendars?lang=&platform=facebook&ven=&vhe= (image/png 1200x630), og:url = the canonical, twitter:card summary_large_image, twitter:site @sefariaproject, twitter:image (platform=twitter), and hreflang alternates en https://www.sefaria.org<path> / he https://www.sefaria.org.il<path>. BUILT 2026-11-04 in src/routes/calendars.tsx (src/lib/routing/site-origins.ts for the Hebrew origin).",
    "Ways in (VERIFIED 2026-11-04): the phone menu's 'Learning Schedules' and /texts' 'All Learning Schedules ›' write the relative href '/calendars'. BUILT 2026-11-04: both now write '/calendars' (they pointed at www.sefaria.org) and open this page.",
    "Voices host (Q-E1): voices.sefaria.org answers /calendars with 404. BUILT 2026-11-04: passed to Django there; with no Django to pass to (pass-through off) the server answers 404 itself, and the browser (leavesClient with the page's host) loads the address in full on the Voices host instead of routing to the Library page.",
    "Hebrew interface parity (2026-11-04): the shared site-wide Library Assistant banner computed Heebo in Hebrew (9px taller); live keeps Roboto there. Fixed in src/features/shell/SiteWideBanner (Roboto stack in both interfaces): 1280 top/full 0.15%, end 0.12%, middle 0.38%, phone full 0.20% — the remainder is the shared Hebrew header (live lays out the Hebrew header differently and labels Texts 'טקסטים' where ours says 'מקורות') and 1px shifts in the sidebar footer/donate button; none of it is this page's markup. English: 0.00% everywhere.",
    "Known differences (2026-11-04): the UA dimension5 page type 'calendars' is not sent (UA is retired; the shell sends no page types); the sidebar footer links are absolute (pre-existing footer).",
])
add("ANL-015", ["2026-11-04: /calendars keeps the old panel's data-anl-batch on the page frame: {\"panel_number\":1,\"content_lang\":\"bilingual\"} in the English interface, \"hebrew\" in the Hebrew one (ReaderPanel.getContentLanguageOverride for menuOpen 'calendars'; panel_type and panel_name are undefined there and not written). VERIFIED against live 2026-11-04. Via NavPage's anlBatch prop. Test: e2e/calendars.spec.ts."])
add("LIB-033", ["The heart's alt is 'donation icon' / 'סמל תרומה' (common.donation_icon). BUILT 2026-11-04."])
add("PRM-016", ["The arrow is an <img alt='Submit'> ('שלח'); ours is a button whose image carries that alt (its accessible name). BUILT 2026-11-04."])
add("LIB-038", ["2026-11-04: 'All Learning Schedules ›' writes '/calendars' (relative, as sefaria.org) and opens the new reader's page (CAL-001)."])
add("GUI-011", ["2026-11-04: the menu's 'Learning Schedules' writes '/calendars' (relative, as sefaria.org) and opens the new reader's page (CAL-001)."])

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
S2 = T / "rebuild-status.json"; st = json.load(open(S2))
st["CAL-001"] = {"status": "done", "by": "src/routes/calendars.tsx, src/features/calendars, src/ui/CalendarsPage"}
st["CAL-002"] = {"status": "done", "by": "src/lib/library/calendars.ts, src/ui/CalendarsPage"}
st["CAL-003"] = {"status": "done", "note": "Redirects answered by the node server; the calendar APIs are Django's", "by": "src/server/calendar-shortcuts.ts"}
st["CAL-004"] = {"status": "done", "note": "On /calendars; the library sidebar still sends no custom", "by": "src/features/calendars/textual-custom.ts"}
st["CAL-005"] = {"status": "partial", "note": "Refetch through the user-query invalidation (unit-tested); the event's diaspora is ignored", "by": "src/features/calendars/textual-custom.ts"}
st["RTE-010"] = {"status": "partial", "note": "/calendars, /calendars/ and the two shortcuts ported; /dayoflearningcalendar stays Django's", "by": "src/routes/calendars.tsx, src/server/calendar-shortcuts.ts"}
st["LIB-050"] = {"status": "done", "by": "src/ui/NavSidebar, src/ui/NewsletterSignUp"}
st["LIB-054"] = {"status": "done", "by": "src/ui/NavSidebar"}
st["PRM-016"] = {"status": "partial", "note": "Sidebar sign-up only", "by": "src/ui/NewsletterSignUp, src/lib/user/newsletter.ts"}
json.dump(st, open(S2, "w"), ensure_ascii=False, indent=1)
