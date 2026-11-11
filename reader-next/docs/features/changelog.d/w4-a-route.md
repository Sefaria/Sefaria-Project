## 2026-11-10 — wave 4, lane a-route: first paint, titles, Hebrew-interface text language, node addresses

### Fixed

- **PLT-003** The server-rendered head links each page kind's stylesheets (v-exits F-2): the reader's classes no longer arrive with the JS. Production build, Pixel 7 / CPU 4× / Slow 4G, median of 3: `/Genesis.1` CLS **0.484 → 0**, LCP 13,992 → 3,644 ms. The book page's CSS is now linked by the server and loaded in the browser too (a merged preload had dropped it: unstyled /Sefer_HaBahir on staging); a guard test covers nine routes.
- **TXT-023** A complex text's node address (`/Arukh_HaShulchan,_Orach_Chaim`) opens its first section via `/api/ref` instead of downloading the whole node (was a 503) (v-exits F-4).
- **BOK-013** The book TOC no longer throws `counts.forEach is not a function` on counts shallower than the node's depth (v-exits F-5).

### Built

- **PLT-006** Reader page titles as www.sefaria.org: `Genesis 1 | The Sefaria Library`, `בראשית א׳ | האוסף של ספריא`, `… with Rashi` / `עם רש"י` while a sidebar names a source; a missing text titled as Django's 404 in either interface (v-parity S2, v-a11y S4). _Verified_ live 2026-11-10.
- **I18-001** The Hebrew interface opens texts in Hebrew when the reader has chosen nothing (legacy middleware.py:194); an explicit choice still wins (v-parity B1).

### Recorded

- Deliberate differences: two panels' title writes the suffix once (legacy repeated it); a node address answers 301 to its first section (as every ref above section level here), where legacy answers 200 at the node's address.
