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

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |
