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

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |

Reserved for the `@sanity` / `@pr` core journeys (PLAN §5.2.3):

- `DEV-SRCH-001`: Cmd/Ctrl-K opens search; a query returns results in the Docs and API Reference tabs
