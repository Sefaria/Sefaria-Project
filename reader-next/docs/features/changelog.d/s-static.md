## 2026-11-10 — static information pages in the new shell (wave 2, lane S: T-F31, T-F32)

### Built

- **STA-001 / STA-005** One static-page route (`src/routes/$page.tsx`) for the 44 `static_pages` of `sites/sefaria/urls.py` (the plan said 46), `/about` and `/ways-to-give` by language, and `/digitized-by-sefaria`: Django's content block (`?format=json&lang=…`) fetched by the server, sanitised, rendered inside the new header, server-rendered; styled by the old site's own stylesheets scoped to `#staticContentWrapper`; About sidebar's selected item; in-app links. _Verified_ against www.sefaria.org (desktop 1280 and phone UA, English and Hebrew): visible text identical, measured layout within 2px, except as listed under each entry.
- **STA-006, STA-007, STA-013, LEG-024** done; **STA-008, STA-012, STA-003, STA-017** partial (what stays Django's is listed in each).
- Ported (T-F32): **STA-008** `/mobile` (UTM-aware store buttons from the first paint, newsletter sign-up, **PRM-016**), **STA-012** `/educators`, **STA-013** the English `/ways-to-give` (DonatePage).
- Hardening (review round 1): addresses judged as a browser reads their scheme; inline CSS escaped after scoping; the shell's own font faces kept; Google Docs frames sandboxed; the Linker bookmarklet matched exactly; no unscoped stylesheet loaded.

### Recorded

- **STA-009, STA-010, STA-011, LEG-022, ADM-056** (and word-by-word, ramban, newsletter, the contests): still Django's pages, accepted exits (`scripts/exits-allowlist.json`), with the reason and what a port needs.
- Deliberate differences: a canonical link on static pages (the old ones had none); the About sidebar hidden by width (≤480px) rather than by the phone user agent; `/mobile-about-menu` in its desktop form.
