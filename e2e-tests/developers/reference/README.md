# Developers Reference: E2E tests

Every endpoint-page interaction of brief §4.3 outside Try It (PLAN §6.2 A to D, and F): the sidebar, parameters, responses, code samples, anchors, the tags popover, prev/next, "Updated", the feedback widget, Cmd-/ and the Discord button in the request panel (`reference_request_panel`).

IDs: `DEV-REF-NNN`. Lands in phase 2 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersReference()`, `pm.onDevelopersShell()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/reference/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/reference/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/reference/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Reference, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- The feedback POST is always intercepted (`pm.onDevelopersShell().interceptFeedback()`).

## Test IDs

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |

Reserved for the `@sanity` / `@pr` core journeys (PLAN §5.2.3):

- `DEV-REF-001`: `/reference/get-v3-texts` renders its title, method badge, parameters and the request panel
