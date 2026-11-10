## 2026-11-10 — static information pages in the new shell (wave 2, lane S: T-F31, T-F32)

### Built

- **STA-001 / STA-005** One static-page route (`src/routes/$page.tsx`) for the 44 `static_pages` of `sites/sefaria/urls.py` (the plan said 46), `/about` and `/ways-to-give` by language, and `/digitized-by-sefaria`: Django's content block (`?format=json&lang=…`) fetched by the server, sanitised, rendered inside the new header, server-rendered; styled by the old site's own stylesheets scoped to `#staticContentWrapper`; About sidebar's selected item; in-app links. _Verified_ against www.sefaria.org (desktop 1280 and phone UA, English and Hebrew): visible text identical, measured layout within 2px, except as listed under each entry.
- **STA-006, STA-007, LEG-024** done; **STA-008, STA-013, STA-003, STA-017** partial (what stays Django's is listed in each).
- **STA-008** `/mobile` ported (T-F32): UTM-aware store buttons from the first paint, newsletter sign-up (**PRM-016**).

### Recorded

- **STA-009, STA-010, STA-011, STA-012, LEG-022, ADM-056**: still Django's pages, accepted exits (`scripts/exits-allowlist.json`), with the reason and what a port needs.
- Deliberate differences: a canonical link on static pages (the old ones had none); the About sidebar hidden by width (≤480px) rather than by the phone user agent; `/mobile-about-menu` in its desktop form.
