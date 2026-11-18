# Developers Search: E2E tests

The search modal (PLAN §2.9, §6.2 H): opening by key and by click, tabs and counts, GET/POST badges, highlighted snippets, paging, keyboard navigation, the empty state, and the absence of "Ask AI".

IDs: `DEV-SRCH-NNN`. Lands in phase 4 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersSearch()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/search/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/search/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/search/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Search, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 16 of 16 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID             | Spec file        | What it asserts                                                                     | Tags            | Local run |
| -------------- | ---------------- | ----------------------------------------------------------------------------------- | --------------- | --------- |
| `DEV-SRCH-001` | `search.spec.ts` | Cmd/Ctrl-K opens search; a query returns results in the Docs and API Reference tabs | `@sanity` `@pr` | passes    |
| `DEV-SRCH-002` | `search.spec.ts` | The header field opens search and focuses the query                                 |                 | passes    |
| `DEV-SRCH-003` | `search.spec.ts` | The empty state reads "Start typing to search…" and there is no "Ask AI"            |                 | passes    |
| `DEV-SRCH-004` | `search.spec.ts` | Tabs are All, Docs, API Reference and Pages, with counts that add up                |                 | passes    |
| `DEV-SRCH-005` | `search.spec.ts` | A tab narrows the results to its section                                            |                 | passes    |
| `DEV-SRCH-006` | `search.spec.ts` | Endpoint results carry their GET/POST badge; docs results none                      |                 | passes    |
| `DEV-SRCH-007` | `search.spec.ts` | The snippet highlights the match                                                    |                 | passes    |
| `DEV-SRCH-008` | `search.spec.ts` | Results come 15 to a page with "Back · 1 of N · Next"                               |                 | passes    |
| `DEV-SRCH-009` | `search.spec.ts` | A single page of results has no pager                                               |                 | passes    |
| `DEV-SRCH-010` | `search.spec.ts` | Arrow keys move the highlight and Enter opens the result                            |                 | passes    |
| `DEV-SRCH-011` | `search.spec.ts` | Choosing a result opens that page                                                   |                 | passes    |
| `DEV-SRCH-012` | `search.spec.ts` | Escape and the Close button close the modal                                         |                 | passes    |
| `DEV-SRCH-013` | `search.spec.ts` | A query with no match says so                                                       |                 | passes    |
| `DEV-SRCH-014` | `search.spec.ts` | Hidden pages are not found                                                          |                 | passes    |
| `DEV-SRCH-015` | `search.spec.ts` | Search opens from an endpoint page too and finds custom pages                       |                 | passes    |
| `DEV-SRCH-016` | `search.spec.ts` | Clearing the query brings back the empty state                                      |                 | passes    |
