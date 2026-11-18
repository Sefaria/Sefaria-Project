# Developers Try It: E2E tests

The Try It flow (PLAN §6.2 E): success and error, a POST with a body, the response panel, the Headers modal and Recent Requests.

IDs: `DEV-TRY-NNN`. Lands in phase 2 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersTryIt()`, `pm.onDevelopersReference()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/try-it/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/try-it/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/try-it/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Try It, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- Apart from `DEV-TRY-001`, answer API calls with the recorded responses in `docs/dev-portal/research/reference/data/interaction-network-log.json` through `pm.onDevelopersTryIt().fulfillApiWith(...)`.

## Test IDs

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |

Reserved for the `@sanity` / `@pr` core journeys (PLAN §5.2.3):

- `DEV-TRY-001`: Try It on `get-v3-texts` with `Genesis 1:1` shows status 200 and JSON (it calls the production API, as the brief asks)
