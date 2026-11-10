## 2026-11-10 — platform lane (wave 2): lighter /api/related, error-beacon receiver, chart and CI carry-overs

### Corrected

- **CON-071** SB-03: the Resources rows ask `/api/related/<section>?with_links=0&sheets=count` (no links; sheets as id + anchors).
  Genesis 1: 12.4 MB / 1.30 MB gzip → 0.61 MB / 46 KB gzip once the Django change is deployed. Other callers and the Voices
  host unchanged; Varnish invalidation covers the client's own (percent-encoded) URLs.
- **RTE-059** The reader pods get `DOMAIN_MODULES`, so the language-domain bounce works in the cluster.

### Added

- **ANL-017** Django receives the browser error beacons at `/api/reader-errors` (Library host; 204; 16 KB; rate limited; one log
  line); the chart sets `PUBLIC_ERROR_ENDPOINT` and `PUBLIC_ERROR_SAMPLE_RATE` for the reader pods.
- **ANL-014** Remote config row `feature.client.remote_config_json` gets `webVitals` (off) for admins to turn on.
- **PLT-031** nginx sends its own `X-Request-Id` to the reader and to Varnish on the reader/optin locations.
- **RTE-040 / RTE-059** `e2e/routing-pass-through.spec.ts` runs in every e2e suite (a third dev server with pass-through).
