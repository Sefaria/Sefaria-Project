"""Wave 1 lane B (django), 2026-11-10: the Django side of the reader-next endpoints, the opt-in audience, the switch back to
the classic reader, content-only static pages, and the Mongo index command. Details only (the client halves own the statuses).
Idempotent: running it twice changes nothing."""

import json
import os
import pathlib

T = pathlib.Path(os.environ.get("ATLAS_DIR") or pathlib.Path(__file__).resolve().parents[1])
atlas = json.load(open(T / "features.json"))
by = {f["id"]: f for f in atlas}


def add(fid, name, lines):
    f = by[fid]
    assert f["name"] == name, f"{fid} is now {f['name']!r}, expected {name!r}"
    print(fid, "|", f["name"])
    f.setdefault("details", [])
    for line in lines:
        if line not in f["details"]:
            f["details"].append(line)


add(
    "ACC-003",
    "Account settings page",
    [
        "SERVER 2026-11-10 (lane B): the New Reader switch on /settings/account shows only while READER_OPTIN is on AND the remote-config key feature.reader.optin.audience includes the user: \"staff\" (default, also for a missing or unknown value; created by remote_config migration 0003) = is_staff only, \"all\" = every signed-in user. /api/profile ignores reader_version=next from anyone else. ReaderChoiceMiddleware clears a stale reader_version=next cookie of a non-staff user (and of any signed-out visitor) while the audience is \"staff\". Tests: reader/tests/reader_choice_api_test.py, sefaria/helper/tests/reader_choice_test.py.",
        "SERVER 2026-11-10 (lane B, T-D05 server half): /api/reader-choice. GET -> {available, canChooseNext, reader, saved}; POST {\"reader\": \"classic\"|\"legacy\"|\"next\"} with X-CSRFToken: classic always works (signed out: cookie only; signed in: also profile.settings.reader_version), next only for the audience (else 403); answers {reader, saved} and sets or clears the cookie; never cached. Tests: reader/tests/reader_choice_api_test.py.",
    ],
)
add(
    "TOP-033",
    "Topics TOC delivery",
    [
        "SERVER 2026-11-10 (lane B): /api/topics-toc and /api/topics/library-count are GET only (405 otherwise) and the same for every visitor; the TOC is the JSON every legacy page already ships in data.js. Neither is in Varnish's cached list, on purpose (no purge on topic edits). v2 /api/v2/topics/<slug> always has `pools` ([] for a topic in no pool). Tests: reader/tests/topics_toc_api_test.py, reader/tests/num_library_topics_api_test.py, sefaria/helper/tests/topic_pools_test.py.",
    ],
)
add(
    "LEG-019",
    "Text edit activity feed (/activity)",
    [
        "SERVER 2026-11-10 (lane B): /api/activity/<ref>/<lang>/<version> validates page (1..10000, else 400 before any lookup; a huge page overflowed Mongo's skip), is GET only, keeps 404 for an unknown ref or version, and carries the same events the page's template is given (parity test). It answers signed-out callers too, while the legacy page is login_required (open question in the lane B report). Tests: reader/tests/segment_history_api_test.py.",
    ],
)
add(
    "STA-005",
    "Static page serving and About sidebar",
    [
        "SERVER 2026-11-10 (lane B, T-B06 for F3/D-5): GET /<static page>?format=json[&lang=en|he] answers {path, lang, title, description, html (the content block), css, inlineCss, baseCss, bodyClass, hasScript} for every static_pages entry, /about and /ways-to-give by language, and /digitized-by-sefaria; rendered for an anonymous desktop visitor; public (max-age 3600) with lang, private without. Standalone documents (random-walk-through-torah, cloudflare_site_is_down_*) answer 404 {standalone: true}. Pages with hasScript (team, jobs, products, strategy, ...) mount legacy JS and are incomplete as HTML. Contract: reader/static_content.py. Tests: reader/tests/static_content_test.py.",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
