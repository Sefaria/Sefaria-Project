"""Lane X (platform carry-overs), wave 2, 2026-11-10: /api/related's lighter modes (SB-03), the error-beacon receiver and its chart
env, web vitals' remote-config row, X-Request-Id from nginx, DOMAIN_MODULES for the reader pods, the pass-through specs in the main
e2e suite. Idempotent: running it twice changes nothing."""

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
    "CON-071",
    [
        "2026-11-10 (SB-03): /api/related/<ref> takes ?with_links=0 (no links: the client has them from /api/links) and ?sheets=count (each sheet as {id, anchorRef, anchorRefExpanded} only, from sefaria/sheets.py get_sheet_anchors_for_ref: no sheet records, owner profiles, collections or scores). New URLs, so new Varnish keys; without them the answer is unchanged for every other caller; the new reader's URL is purged on a text save with the others. The Resources rows ask `?with_links=0&sheets=count` (src/lib/connections/related.ts); counts are unchanged (distinct sheet ids per selected verse). Genesis 1: 12.4 MB raw / 1.30 MB gzip before, 0.61 MB / 46 KB after (the recorded answer projected the way the new modes answer; production answers the new URL in full until this Django change is deployed). Tests: reader/tests/related_api_test.py.",
    ],
)

add(
    "ANL-017",
    [
        "2026-11-10: the receiver is built: POST /api/reader-errors (reader/browser_errors.py, Library host only), CSRF-exempt and unauthenticated (a beacon carries no header), 204; 16 KB cap (413), 30 per client address per minute (429), schema-validated (400), unknown fields dropped, query strings and e-mails re-scrubbed, one line on the `reader-browser` logger (JSON for Datadog), no database write, never cookies or the client address. The chart gives the reader pods PUBLIC_ERROR_ENDPOINT=/api/reader-errors and PUBLIC_ERROR_SAMPLE_RATE (values reader.errors). e2e: the second dev server reports to an intercepted path (playwright.config.ts). Tests: reader/tests/reader_errors_api_test.py, e2e/analytics-observability.spec.ts.",
    ],
)
status["ANL-017"] = {
    "status": "done",
    "note": "First-party beacon reporter (no Sentry) with Django's receiver /api/reader-errors and the chart env; not yet seen in Datadog from a cluster",
    "by": "src/lib/monitoring/error-reporter.ts, reader/browser_errors.py, helm-chart/sefaria/templates/_helpers.tpl",
}

add(
    "ANL-014",
    [
        "2026-11-10: remote_config migration 0005 puts webVitals {enabled: 0, sampleRate: 0.1} into feature.client.remote_config_json (created when missing; added only to a JSON object without webVitals; an admin's value never overwritten), so admins find the switch. Tests: remote_config/tests/client_web_vitals_migration_test.py.",
    ],
)

add(
    "PLT-031",
    [
        "2026-11-10: nginx sends its own $request_id as X-Request-Id (never a client's) to the reader (@reader, /assets/, reader mode's location /) and to Varnish on the reader-mode and optin locations (/api/, Django paths, @reader_down); legacy's locations and the optin location / for visitors without the cookie are unchanged. Django's request log (django-structlog) takes it as its request_id. build/ci/reader-nginx-routing.py checks it in optin and reader modes.",
    ],
)

add(
    "RTE-059",
    [
        "2026-11-10: the chart gives the reader pods DOMAIN_MODULES (the same JSON Django's local settings read; sefaria.readerEnv), so the bounce works in the cluster. e2e/routing-pass-through.spec.ts now runs in every suite against a third dev server with pass-through and DOMAIN_MODULES for localhost / he.localhost, Django answered by the API cassette.",
    ],
)
status["RTE-059"] = {
    "status": "done",
    "note": "Bounce reproduced in the reader's server; DOMAIN_MODULES in the reader pods' env; e2e in every suite",
    "by": "src/server/language-domain.ts, src/start.ts, helm-chart/sefaria/templates/_helpers.tpl",
}

add(
    "RTE-040",
    [
        "2026-11-10: e2e/routing-pass-through.spec.ts (the reader's 404 after Django's, Hebrew 404, Django's own answers, the Voices host untouched) runs in every suite (third dev server in playwright.config.ts; Django = the API cassette). The signed-in case still needs the stand-in Django (E2E_STANDIN).",
    ],
)

json.dump(atlas, open(T / "features.json", "w"), ensure_ascii=False, indent=1)
json.dump(status, open(T / "rebuild-status.json", "w"), ensure_ascii=False, indent=1)
