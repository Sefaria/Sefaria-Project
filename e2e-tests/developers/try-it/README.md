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

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 17 of 17 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID            | Spec file        | What it asserts                                                                        | Tags            | Local run |
| ------------- | ---------------- | -------------------------------------------------------------------------------------- | --------------- | --------- |
| `DEV-TRY-001` | `try-it.spec.ts` | Try It on get-v3-texts with Genesis 1:1 shows status 200 and JSON                      | `@sanity` `@pr` | passes    |
| `DEV-TRY-002` | `try-it.spec.ts` | Clicking Try It shows a loading state, then the status with a green dot                |                 | passes    |
| `DEV-TRY-003` | `try-it.spec.ts` | The response shows the JSON with line numbers and fold markers                         |                 | passes    |
| `DEV-TRY-004` | `try-it.spec.ts` | A reference that does not exist shows a red 404 dot and the error message              |                 | passes    |
| `DEV-TRY-005` | `try-it.spec.ts` | The status dropdown lists the examples and "Clear Response"; clearing empties the card |                 | passes    |
| `DEV-TRY-006` | `try-it.spec.ts` | "Headers" opens a modal with RESPONSE and REQUEST sections and a Close button          |                 | passes    |
| `DEV-TRY-007` | `try-it.spec.ts` | The request fires even when required fields are empty                                  |                 | passes    |
| `DEV-TRY-008` | `try-it.spec.ts` | The request URL is built from the form with each value encoded                         |                 | passes    |
| `DEV-TRY-009` | `try-it.spec.ts` | A POST with a body sends the filled-in JSON                                            |                 | passes    |
| `DEV-TRY-010` | `try-it.spec.ts` | A new row appears at once in Recent Requests; clicking it selects it                   |                 | passes    |
| `DEV-TRY-011` | `try-it.spec.ts` | Recent Requests survive a reload in the same browser                                   |                 | passes    |
| `DEV-TRY-012` | `try-it.spec.ts` | The Try It button is #612854 and turns blue on hover                                   |                 | passes    |
| `DEV-TRY-013` | `try-it.spec.ts` | No elapsed time is shown                                                               |                 | passes    |
| `DEV-TRY-014` | `try-it.spec.ts` | The response copy button copies the body and says "Copied!"                            |                 | passes    |
| `DEV-TRY-015` | `try-it.spec.ts` | The result is announced to screen readers                                              |                 | passes    |
| `DEV-TRY-016` | `try-it.spec.ts` | A request that fails without a response shows an error, not a crash                    |                 | passes    |
| `DEV-TRY-017` | `try-it.spec.ts` | Recent Requests are empty in another browser                                           |                 | passes    |
