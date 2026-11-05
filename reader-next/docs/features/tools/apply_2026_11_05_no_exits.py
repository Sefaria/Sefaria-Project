"""No way out to the legacy client (owner rule, 2026-11-05): topics, notes and revision history ported on reader-next-ports. Idempotent."""
import json, os, pathlib
T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json")); by = {f["id"]: f for f in atlas}
status = json.load(open(T / "rebuild-status.json"))

def add(fid, lines):
    for l in lines:
        if l not in by[fid]["details"]: by[fid]["details"].append(l)

RULE = "Owner rule (2026-11-05): an opted-in reader must never land in the legacy client from inside the new reader; port the page or point the link at a reader-next page (wiki projects/reader-next/exits-to-legacy)."

add("TOP-036", [
    RULE,
    "BUILT 2026-11-05 (replaces 2026-11-04's hand-off): every Library-pool topic is rendered here. A topic outside the A–Z list (some 300: Rashi's students rabbenu-tam, rivan, meir-ben-shmuel; yehuda-herzl-henkin…) is fetched and its pool decided from the API's `pools` where given (this branch's Django), else from the name completer, which filters by pool on sefaria.org today: GET /api/name/<title>?type=Topic&topic_pool=library (VERIFIED 2026-11-05: rabbenu-tam, rivan, yehuda-herzl-henkin found; youth, a sheets-only topic, not; live answers youth 404). Not in the pool: the 404 Django gives. Indexing as live (rabbenu-tam has no robots meta on sefaria.org). src/server/topics-owner.ts now hands Django only ?editor=1 (the moderators' editors, not ported). Tests: e2e/topic-page.spec.ts ('topics outside the A–Z list'), src/server/topics-owner.test.ts.",
])
status["TOP-036"] = {"status": "done", "note": "Every Library-pool topic rendered (pools from the API, else the name completer's topic_pool filter); only ?editor=1 goes to Django", "by": "src/lib/topics/topic-page-source.ts (readTopicPage, inLibraryPool), src/server/topics-owner.ts"}

add("TOP-013", [
    "/topics/category/<a topic that is not a category>: the old client crashed (blank page, console errors; VERIFIED 2026-11-05 on /topics/category/moses). Deliberate deviation: the new reader replaces the address with /topics/<slug>, which renders the topic or Django's 404 (src/features/topics/TopicCategoryRoute.tsx loadTopicCategory). Tests: e2e/topic-page.spec.ts.",
])

add("LEG-019", [
    "BUILT 2026-11-05, a text's revision history only (/activity/<ref>/<lang>/<version>[/<page>]?type=): title, version (Hebrew title in the Hebrew interface), the filter menu, the feed as activity_feed.html (text edits with their diff in green/red, connections, notes, index and term changes with 'details', version metadata, lexicon entries, reviews with a star score, sheets), Django's naturaltime, 'Older Activity »', noindex; refs open in the app. Data: GET /api/activity/<ref>/<lang>/<version>?type=&page= — reader/views.py segment_history_api, NEW on this branch (sefaria.org has no JSON for this page; until it is deployed the API's 404 makes the page a 404, which the server passes to Django). The reader's 'Revision History' link is now relative (same tab rule as live: a new tab). Not built: the site's and a user's activity, the leaderboard (still Django's), and the template's dead revert button. Tests: e2e/activity.spec.ts (the API answer written into the cassette), src/lib/activity/segment-history.test.ts.",
])
status["LEG-019"] = {"status": "partial", "note": "A text's revision history ported (needs this branch's /api/activity); global, user and leaderboard pages still Django's", "by": "src/routes/activity.$.tsx, src/features/activity/RevisionHistoryRoute.tsx, src/ui/RevisionHistory, src/lib/activity/segment-history.ts, reader/views.py segment_history_api"}
add("RTE-018", [
    "BUILT 2026-11-05: /activity/<ref>/<lang>/<version>[/<page>] is this client's on the Library host (src/lib/routing/django-paths.ts CLIENT_UNDER_DJANGO_PREFIX_RE, src/server/route-manifest.ts); /activity, /activity/<n>, /activity/<user>/… and /activity/leaderboard stay Django's, as does all of /activity on the Voices host. Tests: src/lib/routing/django-paths.test.ts.",
])
status["RTE-018"] = {"status": "partial", "note": "Segment history routed to the client; the other activity URLs Django's", "by": "src/lib/routing/django-paths.ts"}

for fid, line in [
    ("USL-008", "BUILT 2026-11-05: /saved and /history in the new reader (signed out: 302 to /login?next=, as login_required), tabs Saved / History / Notes routed in the app, /api/profile/user_history 20 at a time with scroll-to-load, history deduped by consecutive book with its time stamp, the reading-history-off message. Not built: the per-item save button, the language toggle. Tests: e2e/user-history-page.spec.ts, src/lib/user/user-history-page.test.ts, src/ui/UserHistoryPage/UserHistoryPage.test.tsx."),
    ("USL-003", "BUILT 2026-11-05: /texts/notes is the Notes tab of the Saved / History / Notes page (its own route, no longer the /texts/$ category page, which rendered a wrong page there). Tests: e2e/user-history-page.spec.ts."),
    ("USL-004", "BUILT 2026-11-05: each note links to /<ref>?with=Notes (a sheet's note to /sheets/x.y), the text, delete with a confirm. Not built: Add to Sheet on a note. Tests: src/ui/UserHistoryPage/UserHistoryPage.test.tsx."),
    ("RTE-031", "BUILT 2026-11-05: /saved and /history are this client's on the Library host (LIBRARY_ONLY_PREFIXES; Django's on Voices). Tests: e2e/user-history-page.spec.ts."),
    ("RTE-015", "BUILT 2026-11-05: /texts/notes is this client's (src/routes/texts.notes.tsx). /torahtracker is still Django's."),
]:
    add(fid, [line])
status["USL-008"] = {"status": "partial", "note": "Saved and History pages built; per-item save button and language toggle not", "by": "src/routes/saved.tsx, src/routes/history.tsx, src/features/user-history, src/ui/UserHistoryPage"}
status["USL-003"] = {"status": "done", "note": "/texts/notes: the Notes tab", "by": "src/routes/texts.notes.tsx, src/ui/UserHistoryPage"}
status["USL-004"] = {"status": "partial", "note": "Listing with delete and sheet-aware links; Add to Sheet on a note not built", "by": "src/ui/UserHistoryPage"}
status["RTE-031"] = {"status": "partial", "note": "/saved and /history routed to the client; notifications still Django's", "by": "src/lib/routing/django-paths.ts"}
status["RTE-015"] = {"status": "partial", "note": "/texts/notes routed to the client; /torahtracker still Django's", "by": "src/routes/texts.notes.tsx"}

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
