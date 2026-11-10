## 2026-11-10 — wave 1 lane B: the Django side

### Corrected (server details; applied by `tools/apply_2026_11_10_b_django.py`)

- **ACC-003** Account settings page: the New Reader switch now follows the remote-config audience `feature.reader.optin.audience` (`staff` by default, or `all`); a stale `reader_version=next` cookie of someone outside it is cleared. New `/api/reader-choice` (GET state, POST `classic` / `next` with CSRF) lets the new reader switch back to the classic reader without a legacy page (T-D05 server half).
- **TOP-033** Topics TOC delivery: `/api/topics-toc` and `/api/topics/library-count` GET only and the same for everyone; the v2 topic answer always carries `pools`.
- **LEG-019** Text edit activity feed: `/api/activity/...` bounds `page` (1..10000), GET only, 404 for an unknown ref or version, parity with the page's data. It answers signed-out callers; the legacy page requires sign-in (open question).
- **STA-005** Static page serving: `?format=json[&lang=en|he]` answers a static page's content block, title and CSS for the new reader's shell (T-B06, D-5).
