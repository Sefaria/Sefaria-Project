"""Wave 2, lane P (small Library pages), 2026-11-10: notifications, Torah Tracker and New Additions in the new reader; Explore and
Visualizations in a new tab; the settings page and the editors recorded as accepted exits with a way back; the activity lists left to
Django (not reachable). Idempotent: run twice, nothing changes."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))


def add(fid, lines):
    print(fid, "-", by[fid]["name"])
    for l in lines:
        if l not in by[fid]["details"]:
            by[fid]["details"].append(l)


def set_status(fid, value):
    print(fid, "-", by[fid]["name"], "->", value["status"])
    status[fid] = value


# ---------------------------------------------------------------- T-F22 New Additions
add(
    "LIB-022",
    [
        "BUILT 2026-11-10 (T-F22): /updates is this client's page on the Library host (the Voices host keeps Django's): the About sidebar (wide screens; a phone has none, as sefaria.org leaves it out for a phone User-Agent), 'Updates', and the site's global notifications from /api/updates, ten at a time as the reader nears the end (the first ten with the page). Moderators: the old add form (index / version / general) and a delete button on each (POST and DELETE /api/updates with CSRF). Layout VERIFIED against www.sefaria.org with Playwright 2026-11-10 at 1280px and a phone User-Agent at 390px, English and Hebrew, computed styles and positions (e2e/library-pages.spec.ts asserts them).",
        "Deliberate differences: the old page stopped asking for more only when the API's total count was under ten, so at the end it kept requesting empty pages on every scroll (not ported: a short page is the last); the old Hebrew phone page pushed its title off the left of the screen (a 725px column in a 390px window), here it is on screen; on a phone the list is the full width less 30px each side (the old one was a fixed 332.5px, 50% of its 665px column).",
        "Tests: src/lib/updates/updates.test.ts, src/ui/UpdatesPage/UpdatesPage.test.tsx, src/features/notifications/view.test.ts, e2e/library-pages.spec.ts.",
    ],
)
set_status("LIB-022", {"status": "done", "note": "/updates in the new reader (Library host), measured against sefaria.org", "by": "src/routes/updates.tsx, src/features/updates/UpdatesRoute.tsx, src/ui/UpdatesPage, src/lib/updates/updates.ts"})

add(
    "NTF-004",
    [
        "BUILT 2026-11-10 (T-F20, T-F22): global notifications show on New Additions (/updates) and in the reader's notifications (/notifications, the Library scope), both this client's pages.",
    ],
)
set_status("NTF-004", {"status": "done", "note": "Global notifications on /updates and /notifications in the new reader", "by": "src/features/updates/UpdatesRoute.tsx, src/features/notifications/NotificationsRoute.tsx"})

# ---------------------------------------------------------------- T-F20 notifications
add(
    "NTF-001",
    [
        "BUILT 2026-11-10 (T-F20): /notifications is this client's page on the Library host (Voices: Django's, whose list is the Voices notifications): @login_required as Django's (signed out: /login?next=/notifications), the bell and 'Notifications', the reader's notifications from /api/notifications?page=<n>&scope=library ten at a time as the reader nears the end, the old empty message, Stay Connected and the promotion slot. Title as the old app set it once loaded ('Notifications | Sefaria Library' / 'התראות | ספריית ספריא'). Layout VERIFIED 2026-11-10 by measuring the old panel's markup under sefaria.org's own stylesheet (no sign-in on production), English and Hebrew.",
        "Deliberate difference: the old page had the first page in its server's HTML; here it is asked for on arrival (a moment's spinner).",
        "Not built: an unread count or notifications link in the header. sefaria.org's Library header has neither (static/js/Header.jsx shows the bell only in the Voices module); no API gives the count without marking read. Owner question in reports/p-pages.md.",
        "Tests: src/lib/notifications/notifications.test.ts, src/ui/NotificationsPage/NotificationsPage.test.tsx, e2e/library-pages.spec.ts (signed in against the stand-in Django).",
    ],
)
set_status("NTF-001", {"status": "done", "note": "/notifications in the new reader (Library host)", "by": "src/routes/notifications.tsx, src/features/notifications/NotificationsRoute.tsx, src/ui/NotificationsPage, src/lib/notifications/notifications.ts"})

add(
    "NTF-002",
    [
        "BUILT 2026-11-10 (T-F20): the seven kinds of the old NotificationsPanel (src/ui/Notification): new text, new version (English / Hebrew wording), general announcement (moderators' HTML, sanitised; its links to this client's pages open in the app), and the Voices kinds — sheet published, sheet liked, follower, added to a collection — whose links go to the Voices pages (accepted exits). Dates as the old naturalTime: humanize-duration's largest unit, rounded, '<n> <units> ago' / 'לפני ...' (identical to humanize-duration 3.28 on 200,000 random spans).",
        "Deliberate difference: a follower notification has no Follow back button (the Library scope never lists follow notifications; Django keeps them for the Voices site).",
    ],
)
set_status("NTF-002", {"status": "done", "note": "All seven kinds; Voices kinds link out", "by": "src/ui/Notification/Notification.tsx, src/features/notifications/view.ts, src/lib/notifications/natural-time.ts"})

add(
    "NTF-003",
    [
        "BUILT 2026-11-10 (T-F20): every notification the page has loaded that is unread is marked read once, POST /api/notifications/read (notifications=<JSON ids>, scope=library, X-CSRFToken), as the old markAsRead on load and after each page. The answer's unreadCount is not shown anywhere (the Library header has no badge, see NTF-001).",
    ],
)
set_status("NTF-003", {"status": "done", "note": "Marks loaded notifications read (Library scope)", "by": "src/lib/notifications/notifications.ts, src/features/notifications/NotificationsRoute.tsx"})

# ---------------------------------------------------------------- T-F21 Torah Tracker
add(
    "PRO-010",
    [
        "BUILT 2026-11-10 (T-F21): /torahtracker is this client's page on the Library host, @login_required as Django's, reached from the account menu in the app. /api/user_stats/<uid> and /api/site_stats; Previous Year / All Time; an active reader (more than two texts in the period) sees Your Overall Activity, the two donuts, Your Top Categories and Your Favorite Texts; a quiet one the site's numbers. The old d3 5 charts are drawn without d3: pie, arc, centroid, band scale and nice() ported and compared with d3 on 2,000 random inputs (identical). Moderators keep the User ID box. Title once loaded 'Torah Tracker | Sefaria Library' / 'לימוד במספרים | ספריית ספריא'. Layout VERIFIED 2026-11-10 by measuring the old markup under sefaria.org's stylesheet.",
        "Deliberate differences: a slice's hover text gives its share (the old one printed the count as a percentage, e.g. '4,500.00%'); in the Hebrew interface the 'Average Sefaria User' label sits by its bar (the old one was placed as if the bars ran left to right).",
        "Tests: src/lib/torahtracker/stats.test.ts, src/ui/TorahTracker/TorahTracker.test.tsx, e2e/library-pages.spec.ts (signed in against the stand-in Django).",
    ],
)
set_status("PRO-010", {"status": "done", "note": "/torahtracker in the new reader, charts ported from d3", "by": "src/routes/torahtracker.tsx, src/features/torahtracker/TorahTrackerRoute.tsx, src/ui/TorahTracker, src/lib/torahtracker/stats.ts"})

# ---------------------------------------------------------------- routes and the header
add("RTE-015", ["2026-11-10 (T-F21): /torahtracker routed to this client on the Library host (LIBRARY_ONLY_PREFIXES; the Voices host keeps Django's)."])
set_status("RTE-015", {"status": "done", "note": "/texts/notes and /torahtracker routed to the client", "by": "src/routes/torahtracker.tsx, src/routes/texts.notes.tsx, src/lib/routing/django-paths.ts"})
add("RTE-031", ["2026-11-10 (T-F20): /notifications routed to this client on the Library host (LIBRARY_ONLY_PREFIXES; the Voices host keeps Django's)."])
set_status("RTE-031", {"status": "done", "note": "/saved, /history and /notifications routed to the client", "by": "src/routes/notifications.tsx, src/lib/routing/django-paths.ts"})
add("SHL-060", ["2026-11-10 (lane P): the account menu's Torah Tracker and New Additions are in-app links to this client's pages; /notifications is this client's too (no header link to it in the Library, as on sefaria.org)."])
set_status("SHL-060", {"status": "done", "note": "Header pages all routes of this client (Library host)", "by": "src/ui/SiteHeader/SiteHeader.tsx"})
add(
    "GUI-003",
    ["2026-11-10 (T-F20): no notifications link or unread count, deliberately: sefaria.org's Library header has none (the bell is Voices-only in static/js/Header.jsx) and there is no API for the count. Owner question in reports/p-pages.md."],
)

# ---------------------------------------------------------------- T-F23 settings
for fid in ("ACC-003", "RTE-013"):
    add(
        fid,
        [
            "2026-11-10 (T-F23): /settings/account stays Django's — an accepted way out, recorded in scripts/exits-allowlist.json (settings-account). The way back: Cancel goes back in history (else /texts) and the old header's links lead to pages the opt-in routing gives this client; the switch back to the classic reader is also in this client's account and phone menus (T-D05).",
        ],
    )
set_status("ACC-003", {"status": "deferred", "note": "Stays Django (accepted exit with a way back, T-F23); the reader switch is also in the new menus", "by": "scripts/exits-allowlist.json"})
set_status("RTE-013", {"status": "deferred", "note": "Stays Django (accepted exit, T-F23)", "by": "scripts/exits-allowlist.json"})
add("ACC-004", ["2026-11-10 (T-F23): part of /settings/account, which stays Django's (accepted exit)."])
set_status("ACC-004", {"status": "deferred", "note": "Part of /settings/account: stays Django (T-F23)"})
add("AI-004", ["2026-11-10 (T-F23): the Account Settings toggle stays on Django's /settings/account (accepted exit); banner and /enable-library-assistant link are this client's."])

# ---------------------------------------------------------------- T-F24 Explore and Visualizations
for fid in ("LEG-001", "LEG-002", "LEG-011", "LEG-013", "LIB-041"):
    add(
        fid,
        [
            "2026-11-10 (T-F24, D-6): the new reader's links to /explore… and /visualizations (category sidebars' Visualizations module, Resources) open in a new tab (target=_blank, rel=noopener noreferrer); /explore, /visualizations and /visualize/ are on the exits-crawl allowlist (d6-explore, d6-visualizations). Test: e2e/library-pages.spec.ts.",
        ],
    )

# ---------------------------------------------------------------- T-F25 activity lists
add(
    "LEG-020",
    ["2026-11-10 (T-F25): no page of the new reader links to the leaderboard (exits crawl and source search); it stays Django's, not ported. Owner question in reports/p-pages.md."],
)
set_status("LEG-020", {"status": "deferred", "note": "Stays Django; not reachable from the new reader (T-F25)"})
add(
    "LEG-019",
    ["2026-11-10 (T-F25): the site-wide (/activity, /activity/<n>) and per-user (/activity/<user>) lists are not linked from any page of the new reader (the revision history links profiles, which are Voices'); they stay Django's."],
)
add("RTE-018", ["2026-11-10 (T-F25): /activity, /activity/<n>, /activity/leaderboard and /activity/<user> stay Django's; nothing in the new reader links to them."])

# ---------------------------------------------------------------- T-F27 editors
add(
    "LEG-007",
    [
        "2026-11-10 (T-F27): verified that the reader's Add Translation and Edit Text send the reader to /translate/<ref>?next=<this address> and /edit/<ref>/<language>/<version>?next=<this address> (e2e/library-pages.spec.ts against the stand-in Django); the old s1 editor goes to params.next on save and on cancel (static/js/s1/editor.js), and the return forgets the edited book on disk (e2e/freshness.spec.ts). The book page's Add section (/add/<title>, no next: the editor goes to /<title>) is recognised by the referrer too.",
        "Gap (not this lane's file): after the index editor saves, the book page goes to /admin/reset/<title>, which redirects to /<title>?m=Cache-Reset; after a redirect the referrer is the book page, not the reset, so invalidateAfterEditorReturn does not see it and nothing forgets the book's index on disk first. Request in reports/p-pages.md: forgetBeforeEditor({kind: 'book', title}) before that assign in src/features/book/BookRoute.tsx.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
