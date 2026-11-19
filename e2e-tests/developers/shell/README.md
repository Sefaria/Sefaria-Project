# Developers Shell: E2E tests

The portal chrome on every page: header links and their targets, the active tab, the links menu (product switcher), the search field and its key hint, the "Jump to Content" skip link, the mobile drawer and the sidebar dropdown under the mobile header, and the 404 page.

IDs: `DEV-HDR-NNN`. Lands in phase 1 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersShell()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/shell/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/shell/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/shell/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Shell, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 17 of 18 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID            | Spec file        | What it asserts                                                                   | Tags | Local run                                                                                                              |
| ------------- | ---------------- | --------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| `DEV-HDR-001` | `header.spec.ts` | The primary navigation lists live's six links in order                            |      | passes                                                                                                                 |
| `DEV-HDR-002` | `header.spec.ts` | Home, Docs, API Reference and Get in Touch open in the same tab at live's targets |      | passes                                                                                                                 |
| `DEV-HDR-003` | `header.spec.ts` | GitHub and Donate open in a new tab                                               |      | passes                                                                                                                 |
| `DEV-HDR-004` | `header.spec.ts` | Clicking GitHub opens the repository in a new tab                                 |      | passes                                                                                                                 |
| `DEV-HDR-005` | `header.spec.ts` | Docs leads to the welcome page and marks Docs active                              |      | passes                                                                                                                 |
| `DEV-HDR-006` | `header.spec.ts` | API Reference leads to Getting Started and marks API Reference active             |      | passes                                                                                                                 |
| `DEV-HDR-007` | `header.spec.ts` | Get in Touch leads to the contact page and marks it active                        |      | passes                                                                                                                 |
| `DEV-HDR-008` | `header.spec.ts` | Home is the active tab on the homepage and Docs on a docs page                    |      | passes                                                                                                                 |
| `DEV-HDR-009` | `header.spec.ts` | The links menu lists the four Sefaria products                                    |      | passes                                                                                                                 |
| `DEV-HDR-010` | `header.spec.ts` | The links menu closes with Escape                                                 |      | passes                                                                                                                 |
| `DEV-HDR-011` | `header.spec.ts` | The search field shows the platform key hint                                      |      | passes                                                                                                                 |
| `DEV-HDR-012` | `header.spec.ts` | "Jump to Content" is the first focusable element and moves focus into the content |      | **fails**: docs `article#content` has no `tabindex="-1"`, so the skip link leaves focus on the body (W7 docs template) |
| `DEV-HDR-013` | `header.spec.ts` | An unknown address shows the 404 page with status 404                             |      | passes                                                                                                                 |
| `DEV-HDR-014` | `header.spec.ts` | An unknown docs slug is a 404 inside the portal chrome                            |      | passes                                                                                                                 |
| `DEV-HDR-015` | `header.spec.ts` | The header is the same on the home, docs, reference, contact and 404 pages        |      | passes                                                                                                                 |
| `DEV-HDR-016` | `header.spec.ts` | The drawer lists the six links, the two products and the logo                     |      | passes                                                                                                                 |
| `DEV-HDR-017` | `header.spec.ts` | The drawer closes with Escape                                                     |      | passes                                                                                                                 |
| `DEV-HDR-018` | `header.spec.ts` | The sub-nav button names the page and opens the sidebar                           |      | passes                                                                                                                 |
