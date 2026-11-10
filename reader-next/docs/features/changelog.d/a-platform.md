## 2026-11-10 — platform (wave 1, lane A)

### Updated

- **PLT-008** Canonical URLs and hreflang: absolute, from `PUBLIC_CANONICAL_ORIGIN` (default `https://www.sefaria.org`; the Hebrew
  site's host names `www.sefaria.org.il`, as Django), on the two pages that have them (`/calendars`, `/translations/<lang>`); status `partial` (reader, library and topic pages have none yet).
- **PLT-027** Canonical, hreflang, Open Graph and JSON-LD: `og:url` from the same origin; `og:image` still relative in the cluster.
- **SRC-082** Dicta Hebrew Tanakh search merge: the e2e cassette can record and replay Dicta (`/__dicta/`), once a fixture routes it.
- **PLT-022** No service worker (manifest-only PWA), **PLT-025** robots.txt: with the opt-in, nginx serves the favicon, manifests,
  `llms.txt`, `.well-known` and `robots.txt` without consulting the `reader_version` cookie.
- **PLT-031** Health checks and operational endpoints: nginx falls back to Varnish within 5 s when the reader cannot be reached.
