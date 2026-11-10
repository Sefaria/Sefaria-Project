## 2026-11-10 — wave 1 lane B: the Django side

### Corrected (server details; applied by `tools/apply_2026_11_10_b_django.py`)

- **ACC-003** Account settings page: the New Reader switch now follows the remote-config audience `feature.reader.optin.audience` (`staff` by default, or `all`; pods must be restarted after a change, remote config has no pub/sub); a stale `reader_version=next` cookie of someone outside it is cleared, on the Library host only. New `/api/reader-choice` (Library host; GET state and the CSRF cookie, POST `classic` / `next` with CSRF) lets the new reader switch back to the classic reader without a legacy page (T-D05 server half).
- **TOP-033** Topics TOC delivery: `/api/topics-toc` and `/api/topics/library-count` GET only and the same for everyone; the v2 topic answer's `pools` (already on the branch, unchanged) is now covered by a test.
- **LEG-019** Text edit activity feed: `/api/activity/...` now requires sign-in as the legacy page does (401 signed out), bounds `page` to 1..100, GET only, private, 404 for an unknown ref or version, parity with the page's data.
- **STA-005** Static page serving: `?format=json[&lang=en|he]` answers a static page's content block, title and CSS for the new reader's shell, on the Library host only (T-B06, D-5).
