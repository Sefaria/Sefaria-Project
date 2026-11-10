## 2026-11-10 — wave 2, lane GS (shell, library nav, book pages, search, topics)

### Built
- **LIB-025 / LIB-004** Recently Viewed on the library home (sidebar; a band above the categories on a phone), server-rendered from the reader's history. _Verified._
- **LIB-005** The daily dedication from its Google Sheet (gviz endpoint), turning at 6 pm local time.
- **PLT-028, PLT-017, PLT-020, PLT-021, PLT-001** The head links OpenSearch, the Library's icons and (same origin) the manifest; apple-itunes-app, theme-color and the home-screen title as base.html. _Verified (curl)._
- **PLT-006, PLT-007, RTE-029** Library home, category, book and search titles and descriptions as sefaria.org's (titles as its client leaves them, descriptions as its server writes them); /search is noindex. _Verified._
- **SRC-012** The header's Enter repairs a miscapitalised name first ("pirkei avot" opens the book). _Verified (name API)._
- **GUI-003 / PRM-004 (T-G02)** Hebrew interface: desktop "טקסטים", phone menu "מקורות", Donate to the Hebrew campaign, the search box in Heebo, right to left. _Verified._

### Corrected
- **GUI-006** Global warning message: dead on sefaria.org since 2493041b8f (2020) → n/a.
- **TOP-036** An ambiguous name's topic page (/topics/רג-(ambiguous)) renders as on sefaria.org instead of 404; topic 404s use the shared Page Not Found.
- **LIB-069** /texts/history is the library home with the home's title.
- **TOP-029** dimension5 is Universal Analytics: not sent (owner decision), nothing to port.

### Found
- sefaria.org's CMS query fails today: production Strapi has no showToDonor / showToNonDonor fields, so /api/strapi/graphql-cache answers 500 ("Strapi request failed with status 400") and no banner, modal or sidebar ad renders, although three November fundraising modals are published. The CMS reader (PRM-001…003, 006…008, 010…013) is not built here; see the lane report.
