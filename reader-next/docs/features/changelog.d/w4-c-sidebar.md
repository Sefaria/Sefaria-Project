## 2026-11-10 — the sidebar against sefaria.org (wave 4, lane c-sidebar)

### Fixed

- **CON-032** A ranged connected text ("Abarbanel on Torah, Genesis 1:1") shows one paragraph per segment, as sefaria.org. _Verified._
- **CON-039 / VER-006** About this Text: the source version on screen is "Current Version", before the translation, in bilingual and Hebrew; the side the text hides is left out; the description's type is sefaria.org's (16px/19px #666). In the Hebrew interface the book's Hebrew title, description and composition show. _Verified._
- **BOK-006** The Hebrew interface's book page falls back to the short Hebrew description before the English one (needs BookRoute to pass it).
- **BOK-009** The sidebar's Torah portions: two columns with inline aliyot, as the book page and sefaria.org (392px, was 2008px). _Verified._
- **CON-012 / CON-019 / CON-030** Hebrew Resources panel: legacy's headings (מקורות לעיון, עזרים), no EN tags, lists ordered in the sidebar's language. _Verified._
- **CON-070 / VER-009** Accessible names in the Hebrew interface (panel, Close, sections, Preview, Select, new tab); the sidebar's language button is named "Show in Hebrew" / "Show in English"; no link past the edge of a 320px phone.
- **CON-071** Opening or reopening the sidebar no longer sends /api/related twice.
