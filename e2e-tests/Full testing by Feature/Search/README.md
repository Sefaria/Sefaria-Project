# Search — E2E Tests

Feature-coverage tests for **search** across both modules: autocomplete suggestion click-through, search submission/results, and the module-specific dropdown sections + icons. Runs under the `chrome-search` / `firefox-search` / `safari-search` projects.

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

---

## Conventions for this folder

- **Entry point:** `goToPageWithLang(context, MODULE_URLS.EN.LIBRARY | .VOICES, LANGUAGES.EN)`.
- **ID scheme:** `SRCH-###`.
- **Page object:** dropdown section/icon assertions go through [pm.onModuleHeader()](../../pages/moduleHeaderPage.ts) (`testSearchDropdown`, `testSearchDropdownIcons`); section/icon/term constants live in `SEARCH_DROPDOWN` ([../../constants.ts](../../constants.ts)).

## Running

```bash
npx playwright test --project=chrome-search
npx playwright test -g 'SRCH-003'
```

## Related

- [../../README.md](../../README.md) — the suite handbook
- [../../Sanity/README.md](../../Sanity/README.md) — what `@sanity` means + the release-gate suite
