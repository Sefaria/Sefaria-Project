## 2026-11-10 — lane C: observability (wave 1)

### Corrected

- **ANL-010 / ANL-016** Universal Analytics: the old client's Track.event and Track.set* (dimension5…) calls never reach a tracker on www.sefaria.org (track.js binds `ga` before analytics.js has created it), and GA4 gets no page-type dimension. Owner decision 2026-11-10: the new reader sends no UA hits (logged only). _Verified_ with scripts/analytics-parity.mjs.
- **ANL-003** both `header_viewed` impressions (category colour line and header) on a session's first page, as on www.sefaria.org. _Verified._
- **ANL-009** `onclick_ToolTipped` from the display-options button, with ReaderApp's keywordTargets. _Verified._
- **PRM-014 / AI-001** master port of #3934: the Library Assistant stand-alone banner is removed (no more `promo_viewed` for it); the header's ✦ Library Assistant pill, which replaced it on sefaria.org, is ported.
- **LEG-019** signed out, the revision history sends the reader to log in (the API's new 401).
- **GUI-007** Cookie notice: production's colours are navy (rgb(33, 46, 80)), not grey; phones get a full-width bar that keeps the page's end above it and lifts the Library Assistant's button (master #3948). _Verified._

### Updated

- **ANL-017** Browser error reporting: a first-party beacon reporter replaces Sentry (D-8); `partial` until the receiving endpoint exists.
- **ANL-014** Web vitals: `web_vitals` GA4 event (D1), first-party measurement, behind remote config `webVitals.enabled`.
- **PLT-031** Request logs: JSON line per request with `X-Request-Id` (module built; start.ts wiring is lane E's).
- **ACC-003** Account settings: "Back to the classic reader" and "Report a problem" in the new reader's menus while the opt-in exists; the remote-config kill switch `feature.reader.next.disabled`.
