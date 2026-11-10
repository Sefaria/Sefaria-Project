"""Lane C (observability), wave 1, 2026-11-10: error reports, request logs, web vitals, dimension5, the opt-in's menu items, the
kill switch's client half, the cookie notice on phones. Idempotent: running it twice changes nothing."""

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


add(
    "ANL-017",
    [
        "BUILT 2026-11-10 (decision D-8; Sentry stays out): a first-party reporter (src/lib/monitoring/error-reporter.ts) beacons window errors, unhandled rejections, React boundary errors (root, route via RouteError, each text panel) and hydration errors to PUBLIC_ERROR_ENDPOINT with navigator.sendBeacon; off when unset. Payload: message and stack (truncated; query strings, fragments and e-mail addresses scrubbed), release (APP_VERSION), route kind, signed-in flag, path without query, user-agent class, sample rate, ms since load. Installed at module load, before hydration (src/lib/monitoring/browser.ts). Path secrets collapsed (src/lib/monitoring/redact-path.ts); a non-Error throw reported by its type only; off for bots; 4xx API answers not reported; sampled per page load (PUBLIC_ERROR_SAMPLE_RATE), at most 10 per page and 30 per session, duplicates once. PUBLIC_ERROR_ENDPOINT must be same-origin. The old track.js window.onerror 'Javascript Errors' UA event is not ported (no UA hits, owner decision 2026-11-10). The receiving endpoint is not built yet (contract in rn-shared/reports/c-observability.md). Tests: src/lib/monitoring/error-reporter.test.ts, e2e/analytics-observability.spec.ts.",
    ],
)
status["ANL-017"] = {
    "status": "partial",
    "note": "First-party beacon reporter built (no Sentry); needs the receiving endpoint and PUBLIC_ERROR_ENDPOINT in the chart",
    "by": "src/lib/monitoring/error-reporter.ts, src/lib/monitoring/ErrorBoundary.tsx, src/features/shell/Monitoring.tsx",
}

add(
    "ANL-010",
    [
        "2026-11-10: the old ReaderApp.trackPageview still calls Track.setPageType (dimension5 = panels[0].menuOpen || mode) and the other Track.set* dimensions, but they only ever went to Universal Analytics, and on www.sefaria.org even that call never reaches a tracker (track.js binds `ga` before GTM's analytics.js has made it; VERIFIED with scripts/analytics-parity.mjs). GA4 receives no page-type dimension from the old client, so the new reader sends none (owner decision 2026-11-10: no Universal Analytics hits).",
    ],
)

add(
    "ANL-016",
    [
        "Owner decision 2026-11-10: no Universal Analytics hits from the new reader. The old client's Track.event calls never fire on www.sefaria.org (track.js binds `ga` before the tracker exists, so they go to its mock; VERIFIED with scripts/analytics-parity.mjs) and the UA property is shut down. src/lib/analytics/core.ts uaEvent now only writes the in-page analytics log (tests keep the old names); nothing is sent to `ga`. The old window.onerror 'Javascript Errors' UA event is not ported for the same reason. The GA4 stream is unchanged.",
    ],
)
status["ANL-016"] = {
    "status": "replaced",
    "note": "UA calls logged only, never sent (owner decision 2026-11-10: legacy's never fire, the property is shut down)",
    "by": "src/lib/analytics/core.ts",
}

add(
    "ANL-003",
    [
        "2026-11-10: on www.sefaria.org a reader's first page sends header_viewed twice, impression_type category_color_line and regular_header (parity diff). The new reader sent only the header's: its text panel mounts after the header has reported and set the shared session key. useOnceFullyVisible now judges the key as it was when the page loaded and lets each call site report once per page, so both are sent. Deliberate difference: a colour line first fully visible on a later in-app page of that first page load still reports. Tests: e2e/analytics-observability.spec.ts.",
    ],
)

add(
    "ANL-009",
    [
        "2026-11-10: the display-options button sends the old `onclick_ToolTipped {classes: 'readerOptionsTooltip tooltip-toggle', keywordTargets, interfaceLang}` (DisplaySettingsButton is a ToolTipped; TrackG4.gtagClick) when it opens the menu; keywordTargets as ReaderApp.getUserContext: the refs' categories, the book, the refs, lower-cased, de-duplicated (the text's section, plus the selected verse while the sidebar is open). The old one also fires on the click that closes the menu. Tests: src/lib/analytics/observability.test.ts, e2e/analytics-observability.spec.ts.",
    ],
)

add(
    "LEG-019",
    [
        "2026-11-10 (lane B's contract): /api/activity answers 401 signed out. The new page's server call forwards the reader's cookie, and a 401 sends the reader to /login?next=<the page> (302), as Django's login_required page did. Tests: e2e/analytics-activity-auth.spec.ts.",
    ],
)

add(
    "ANL-014",
    [
        "2026-11-10 (decision D1, T-D03): web vitals as one GA4 `web_vitals` event per metric (LCP, CLS, INP when the page is hidden; FCP, TTFB when known) through the existing gtag, with metric_name, metric_value, metric_rating, metric_id, page_type (route kind), debug_target (tag#id.class, never text) and reader_variant 'next'. The `web-vitals` package is not a dependency, so the measurement is first-party (PerformanceObserver). On only when remote config feature.client.remote_config_json has webVitals {enabled: 1, sampleRate}. The old reader sends no web_vitals event. Tests: src/lib/analytics/observability.test.ts.",
    ],
)

add(
    "PLT-031",
    [
        "2026-11-10 (T-D02, Node side): src/lib/monitoring/server-log.ts writes one JSON line per page request (request_id, http.method/path/status_code/route_kind, duration in ns, upstream_status, pass_through, upstream_failed, release) and answers X-Request-Id (the incoming one when well-formed); withRequestId() adds it to upstream calls. Not wired yet: src/start.ts (lane E) calls beginRequestLog / finish. Tests: src/lib/monitoring/server-log.test.ts.",
    ],
)
status["PLT-031"] = {
    "status": "partial",
    "note": "Request log module built; start.ts wiring and the Django side of the request id pending",
    "by": "src/lib/monitoring/server-log.ts",
}

add(
    "ACC-003",
    [
        "2026-11-10 (T-D05 client half, T-C03 client half): while the reader_version=next cookie is present (the opt-in exists for this reader), the account menu and the phone menu offer 'Report a problem' (the sidebar's Feedback form in a dialog; the message is prefixed '[New reader]') and 'Back to the classic reader' (POST /api/reader-choice {reader: 'legacy'} with CSRF, then the cookie is cleared on the host and its parent domains and the page reloads). New GA4 events for these new controls only: reader_report_problem {source}, reader_back_to_classic {source, transport_type: beacon}. Remote config feature.reader.next.disabled = true clears the cookie and reloads into the classic reader once per session. Tests: src/features/shell/reader-choice.test.ts, src/ui/SiteHeader/SiteHeader.test.tsx, e2e/analytics-observability.spec.ts.",
    ],
)
status["ACC-003"] = {
    "status": "partial",
    "note": "The way back and the kill switch built in the new reader; the endpoint (lane B) and the settings page itself are Django's",
    "by": "src/features/shell/reader-choice.ts, src/features/shell/ReaderChoice.tsx",
}

add(
    "GUI-007",
    [
        "2026-11-10 (master #3948 ported): phone widths: a full-width navy bar on the bottom edge (centred text, OK inline); its height is published as --bottom-bar-height (the app and the phone menu keep their end above it) and --lc-launcher-bottom-offset (lifts the Library Assistant's button). Tablet and wider: a 360px card in the corner, the launcher offset forced to 0. Colours VERIFIED on www.sefaria.org v7.11.4 (Pixel 7 and 1280px, 2026-11-10): background rgb(33, 46, 80), a 1px #ccc top rule on phones, OK white with #333 text, 10px 14px padding, 6px radius. Tests: src/ui/CookieNotice/bottom-bar.test.ts, e2e/analytics-observability.spec.ts.",
    ],
)
status["GUI-007"] = {"status": "done", "by": "src/ui/CookieNotice"}

add(
    "PRM-014",
    [
        "2026-11-10: www.sefaria.org no longer shows the 'Ask the Library Assistant' site-wide banner (ChatbotExperimentBanner unmounted in #3934, 2026-11-03), so it sends no promo_viewed for it. The new reader still shows the banner but no longer sends promo_viewed (parity diff); whether to keep the banner is open (lane-C report).",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
