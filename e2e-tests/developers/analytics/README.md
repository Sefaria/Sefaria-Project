# Developers Analytics: E2E tests

GA4 (PLAN §2.13, contract C8): exactly one `page_view` per navigation, each key event with its parameters (`discord_cta_click`, `try_it_run`, `copy_page_action`, `contact_form_start`), read from intercepted `**/g/collect*` requests, and every page's `document.title`.

IDs: `DEV-GA-NNN`. Lands in phase 5 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersShell()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/analytics/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/analytics/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/analytics/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Analytics, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- Start the capture before navigating: `const ga = await pm.onDevelopersShell().captureAnalytics()`. Hits are answered locally and never reach Google.

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 12 of 13 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID           | Spec file     | What it asserts                                                                      | Tags | Local run                                                                      |
| ------------ | ------------- | ------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------ |
| `DEV-GA-001` | `ga4.spec.ts` | One page_view on load, with the page title and location                              |      | passes                                                                         |
| `DEV-GA-002` | `ga4.spec.ts` | One page_view per client-side navigation, none duplicated                            |      | passes                                                                         |
| `DEV-GA-003` | `ga4.spec.ts` | A fragment change is not a navigation                                                |      | passes                                                                         |
| `DEV-GA-004` | `ga4.spec.ts` | Endpoint pages report the operation summary as the title                             |      | passes                                                                         |
| `DEV-GA-005` | `ga4.spec.ts` | The homepage is "Sefaria" and the 404 page is "404 Not Found"                        |      | passes                                                                         |
| `DEV-GA-006` | `ga4.spec.ts` | discord_cta_click carries the placement                                              |      | passes                                                                         |
| `DEV-GA-007` | `ga4.spec.ts` | try_it_run carries the operation id, the method and the status, and no values        |      | passes                                                                         |
| `DEV-GA-008` | `ga4.spec.ts` | copy_page_action reports each action                                                 |      | **fails**: stops at the same Copy Page deep-link step as DEV-AI-028 (W2 / W14) |
| `DEV-GA-009` | `ga4.spec.ts` | contact_form_start is sent once, when focus first moves into the form                |      | passes                                                                         |
| `DEV-GA-010` | `ga4.spec.ts` | Every event is a C8 event with C8 parameters only                                    |      | passes                                                                         |
| `DEV-GA-011` | `ga4.spec.ts` | document.title equals live's title for every page in research/site/pages.json        |      | passes                                                                         |
| `DEV-GA-012` | `ga4.spec.ts` | Every endpoint page's title is its operation summary                                 |      | passes                                                                         |
| `DEV-GA-020` | `ga4.spec.ts` | Nothing is sent to Google when DEVPORTAL_GA4 is empty, and gtag loads when it is set |      | passes                                                                         |
