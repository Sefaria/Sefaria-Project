# Search — E2E Tests

Feature-coverage tests for **search** across both modules: autocomplete suggestion click-through, search submission/results, the module-specific dropdown sections + icons, and the tabbed search-results page (Sources / Books / Authors / Topics). Runs under the `chrome-search` / `firefox-search` / `safari-search` projects.

New here? Read the root [handbook](../../README.md) first — it covers setup, the PageManager pattern, and the conventions every spec follows.

> Search spans Library and Voices, so each test navigates to an absolute `MODULE_URLS.EN.LIBRARY` / `.VOICES` URL. The project `baseURL` (Library) is therefore incidental.

---

## What it covers

| Test ID | Module | Asserts |
| --- | --- | --- |
| `SRCH-001` | Library | Type a term, click a topic suggestion, land on the topic page. |
| `SRCH-002` | Library | Press Enter; results page with the query param; results visible. |
| `SRCH-003` | Library | Dropdown sections present (Authors/Topics/Categories/Books), Users absent; correct icons. |
| `SRCH-004` | Voices | Type, click a suggestion, land on topic/profile. |
| `SRCH-005` | Voices | Press Enter; Voices results page; results visible. |
| `SRCH-006` | Voices | Dropdown sections present (Topics/Authors/Users), Categories/Books absent; correct icons. |

**All six are tagged `@sanity`** — they are part of the release-gate suite (see [../../Sanity/README.md](../../Sanity/README.md)).

### Entity tabs — sort & filter ([search-sort-and-filter.spec.ts](search-sort-and-filter.spec.ts))

| Test ID | Tab | Asserts |
| --- | --- | --- |
| `SRCH-030` | Books | Sort menu offers relevance, both composition-date directions, and A-Z. |
| `SRCH-031` | Topics | Sort menu offers relevance + A-Z only; relevance preserves API order. |
| `SRCH-032` | Authors | A-Z reorders alphabetically (relevance baseline asserted first). |
| `SRCH-033` | Authors | Year ascending — BCE author leads, undated author trails. |
| `SRCH-034` | Authors | Year descending — reversed, undated author *still* trails. |
| `SRCH-035` | Books | Composition-date sort, both directions. |
| `SRCH-036` | Books | Category filter narrows, ORs two categories, and clears. |

### Entity tabs — infinite scroll ([search-infinite-scroll.spec.ts](search-infinite-scroll.spec.ts))

| Test ID | Asserts |
| --- | --- |
| `SRCH-040` | Scrolling to the bottom appends the next page at offset 20 (append, not replace). |
| `SRCH-041` | No further requests once `hits.length` reaches `total`. |
| `SRCH-042` | Five back-to-back scroll events still fetch page 2 exactly once. |

### Sheets With ref — regression smoke ([sheets-with-ref.spec.ts](sheets-with-ref.spec.ts))

| Test ID | Asserts |
| --- | --- |
| `SRCH-050` | `/sheets-with-ref/<ref>` on Voices mounts and renders at least one sheet result. |

`SheetsWithRefPage.jsx` used to render through `SearchPage`; the results rewrite forked that layout into a local `SheetsWithRefLayout` so search UX changes stop restyling it. Nothing else in the suite loads this page — `Resource Panel/sheets.spec.ts` (RP-101) only asserts the URL opens, then closes the tab. SRCH-050 is the tripwire for the fork breaking outright. It uses real data (`Ezra.2.29`, verified via `GET /api/related/`) rather than the entity-search mock, which does not serve sheet results.

**Still uncovered on this page:** the sort box, filter sidebar, AI-ranking badge, and result count.

---

## Mocking `/api/entity-search`

`SRCH-030`–`SRCH-042` serve the entity endpoint from [../../fixtures/entitySearchFixtures.ts](../../fixtures/entitySearchFixtures.ts) via `installEntitySearchMock` ([../../utils.ts](../../utils.ts)).

This is not a shortcut around missing test data. **Sorting and category filtering are entirely client-side** — `entitySearch()` never sends a `sort` param ([static/js/sefaria/search.js](../../../static/js/sefaria/search.js)), and `getSortedEntityData` sorts and filters already-fetched hits in the browser ([static/js/SearchPage.jsx](../../../static/js/SearchPage.jsx)). Fixtures therefore allow *exact* expected orderings rather than "assert something changed", and let pagination be driven deterministically.

Two consequences worth knowing:

- The mock is registered on the **context**, not the page, so it is live before `goToPageWithLang` navigates — the same reason `installOverlaySuppression` routes at context level.
- It covers the **Books / Authors / Topics** tabs only. The **Sources** tab is served by the text-search API and is untouched.

> These specs are **desktop-only**: the sort dropdown renders only when `Sefaria.multiPanel` is true, decided server-side from the User-Agent (`reader/views.py`). Mobile gets a filter/sort drawer instead and needs its own spec under `mobile web/`.

---

## Conventions for this folder

- **Entry point:** `goToPageWithLang(context, MODULE_URLS.EN.LIBRARY | .VOICES, LANGUAGES.EN)`. For the results page, build the URL with `librarySearchUrl(query, searchTab?)` from [../../constants.ts](../../constants.ts) — note the tab param is `search_tab`, since `tab` already means the text/sheet search type.
- **ID scheme:** `SRCH-###`. `001`–`006` header autocomplete + submit, `030`–`036` entity sort/filter, `040`–`042` infinite scroll, `050`+ Sheets With ref.
- **Page object:** dropdown section/icon assertions go through [pm.onModuleHeader()](../../pages/moduleHeaderPage.ts) (`testSearchDropdown`, `testSearchDropdownIcons`); section/icon/term constants live in `SEARCH_DROPDOWN` ([../../constants.ts](../../constants.ts)). Results-page interactions go through [pm.onSearchPage()](../../pages/searchPage.ts) (`selectTab`, `setSort`, `toggleBookCategoryFilter`, `resultCardNames`, `scrollResultsToBottom`).

## Running

```bash
npx playwright test --project=chrome-search
npx playwright test -g 'SRCH-003'
npx playwright test --project=chrome-search "Full testing by Feature/Search/search-sort-and-filter.spec.ts"
```

## Related

- [../../README.md](../../README.md) — the suite handbook
- [../../Sanity/README.md](../../Sanity/README.md) — what `@sanity` means + the release-gate suite
