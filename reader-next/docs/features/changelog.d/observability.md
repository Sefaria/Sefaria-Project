## 2026-11-10 — lane C: observability (wave 1)

### Corrected

- **ANL-010** Pageview dimensions: the old client still calls `Track.setPageType` (dimension5) on every page, but on www.sefaria.org the call never reaches GTM's `ga` tracker (track.js binds `ga` before analytics.js has created the tracker). The new reader sets dimension5 with the old values; status `done`. _Verified_ with scripts/analytics-parity.mjs.
- **GUI-007** Cookie notice: production's colours are navy (rgb(33, 46, 80)), not grey; phones get a full-width bar that keeps the page's end above it and lifts the Library Assistant's button (master #3948). _Verified._

### Updated

- **ANL-017** Browser error reporting: a first-party beacon reporter replaces Sentry (D-8); `partial` until the receiving endpoint exists.
- **ANL-014** Web vitals: `web_vitals` GA4 event (D1), first-party measurement, behind remote config `webVitals.enabled`.
- **PLT-031** Request logs: JSON line per request with `X-Request-Id` (module built; start.ts wiring is lane E's).
- **ACC-003** Account settings: "Back to the classic reader" and "Report a problem" in the new reader's menus while the opt-in exists; the remote-config kill switch `feature.reader.next.disabled`.
