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
        "BUILT 2026-11-10 (decision D-8; Sentry stays out): a first-party reporter (src/lib/monitoring/error-reporter.ts) beacons window errors, unhandled rejections, React boundary errors (root, route via RouteError, each text panel) and hydration errors to PUBLIC_ERROR_ENDPOINT with navigator.sendBeacon; off when unset. Payload: message and stack (truncated; query strings, fragments and e-mail addresses scrubbed), release (APP_VERSION), route kind, signed-in flag, path without query, user-agent class, sample rate, ms since load. Sampled per page load (PUBLIC_ERROR_SAMPLE_RATE), at most 10 per page, duplicates once. The old track.js window.onerror 'Javascript Errors' UA event is kept. The receiving endpoint is not built yet (contract in rn-shared/reports/c-observability.md). Tests: src/lib/monitoring/error-reporter.test.ts, e2e/analytics-observability.spec.ts.",
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
        "2026-11-10: the old ReaderApp.trackPageview still calls Track.setPageType (dimension5 = panels[0].menuOpen || mode) on every page, but the analytics parity harness (scripts/analytics-parity.mjs) shows the call never reaches GTM's ga tracker on www.sefaria.org: track.js binds `ga` when it loads, before analytics.js has created the tracker, so it uses its mock. The new reader sets dimension5 with the old values through the `ga` shim when a tracker exists (src/lib/analytics/page-dimensions.ts); a set sends no hit and nothing goes to gtag. Tests: src/lib/analytics/observability.test.ts, e2e/analytics-observability.spec.ts.",
    ],
)
status["ANL-010"] = {
    "status": "done",
    "note": "dimension5 set as the old code intends (the old client's call is lost to a load-order bug; see details)",
    "by": "src/lib/analytics/page-dimensions.ts",
}

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

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
