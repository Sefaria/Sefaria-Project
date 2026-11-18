# Developers Accessibility: E2E tests

axe (WCAG 2.1 A and AA) on every page type and on open menus and modals, and the keyboard paths through the header, sidebar, search, Copy Page and Try It.

IDs: `DEV-A11Y-NNN`. Lands in phase 2 to 8 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersShell()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/a11y/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/a11y/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/a11y/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Accessibility, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- Use `pm.onDevelopersShell().axeViolations()` and assert that the result is `[]`.

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 10 of 36 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID             | Spec file      | What it asserts                                                                           | Tags | Local run                                                                                                                                                |
| -------------- | -------------- | ----------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEV-A11Y-001` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /                                                     |      | **fails**: axe: header search `kbd` hint contrast (W2) and carousel card title contrast (W11)                                                            |
| `DEV-A11Y-002` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /docs/welcome                                         |      | **fails**: axe: header `kbd` contrast (W2); sidebar group toggles under 24px, WCAG 2.2 target-size (W2 sidebar)                                          |
| `DEV-A11Y-003` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /reference/get-v3-texts                               |      | **fails**: axe: header `kbd` (W2); enum select placeholder and code-sample line-number contrast (W3)                                                     |
| `DEV-A11Y-004` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /reference/post-find-refs                             |      | **fails**: axe: header `kbd` (W2); body select and code-sample contrast (W3)                                                                             |
| `DEV-A11Y-005` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /page/contact-us                                      |      | **fails**: axe: header `kbd` (W2); Discord button contrast on the contact page (W11)                                                                     |
| `DEV-A11Y-006` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /reference/getting-started                            |      | **fails**: axe: header `kbd` (W2); sidebar toggle target-size (W2)                                                                                       |
| `DEV-A11Y-007` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /no-such-page-e2e                                     |      | **fails**: axe: header `kbd` contrast (W2)                                                                                                               |
| `DEV-A11Y-008` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /docs/the-disambiguator                               |      | **fails**: axe: header `kbd` (W2); sidebar toggle target-size (W2)                                                                                       |
| `DEV-A11Y-009` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /docs/categories                                      |      | **fails**: axe: header `kbd` (W2); sidebar toggle target-size (W2)                                                                                       |
| `DEV-A11Y-010` | `a11y.spec.ts` | axe finds no WCAG A/AA violation on /docs/איך-ליצור-מראי-מקורות-להפניה                    |      | **fails**: axe: header `kbd` (W2); sidebar toggle target-size (W2)                                                                                       |
| `DEV-A11Y-011` | `a11y.spec.ts` | axe finds no violation on the gallery list and a project page                             |      | **fails**: axe: header `kbd` contrast on the gallery pages (W2)                                                                                          |
| `DEV-A11Y-020` | `a11y.spec.ts` | The links menu, open, has no violation                                                    |      | **fails**: axe: header `kbd` (W2); sidebar toggle target-size (W2)                                                                                       |
| `DEV-A11Y-021` | `a11y.spec.ts` | The search modal, with results, has no violation                                          |      | passes                                                                                                                                                   |
| `DEV-A11Y-022` | `a11y.spec.ts` | The Copy Page menu, open, has no violation                                                |      | **fails**: axe: header `kbd` (W2); sidebar toggle target-size (W2)                                                                                       |
| `DEV-A11Y-023` | `a11y.spec.ts` | The feedback popover, open, has no violation                                              |      | **fails**: axe: header `kbd` (W2); sidebar toggle target-size (W2)                                                                                       |
| `DEV-A11Y-024` | `a11y.spec.ts` | The image lightbox, open, has no violation                                                |      | passes                                                                                                                                                   |
| `DEV-A11Y-025` | `a11y.spec.ts` | An endpoint page with the "More Languages" menu open has no violation                     |      | **fails**: axe: header `kbd` (W2); reference select and code-sample contrast (W3)                                                                        |
| `DEV-A11Y-026` | `a11y.spec.ts` | An endpoint page with the library menu open has no violation                              |      | **fails**: axe: header `kbd` (W2); reference select and code-sample contrast (W3)                                                                        |
| `DEV-A11Y-027` | `a11y.spec.ts` | An endpoint page with the response-example menu open has no violation                     |      | **fails**: axe: header `kbd` (W2); "Clear Example" item contrast (W3)                                                                                    |
| `DEV-A11Y-028` | `a11y.spec.ts` | An endpoint page with the tags popover open has no violation                              |      | **fails**: axe: header `kbd` (W2); reference contrast (W3)                                                                                               |
| `DEV-A11Y-029` | `a11y.spec.ts` | An endpoint page with an example list open has no violation                               |      | **fails**: axe: header `kbd` (W2); reference contrast (W3)                                                                                               |
| `DEV-A11Y-030` | `a11y.spec.ts` | After Try It, the response and the Headers modal have no violation                        |      | **fails**: axe: header `kbd` (W2); reference contrast (W3)                                                                                               |
| `DEV-A11Y-031` | `a11y.spec.ts` | An endpoint page with every response expanded has no violation                            |      | **fails**: axe: header `kbd` (W2); reference contrast (W3)                                                                                               |
| `DEV-A11Y-040` | `a11y.spec.ts` | Every page type has exactly one h1                                                        |      | **fails**: /docs/welcome has two h1: the title and the body's own `# Welcome…` heading (W7 import/renderer: demote or drop a body h1 equal to the title) |
| `DEV-A11Y-041` | `a11y.spec.ts` | The landmarks of C6: one banner, one main, primary navigation, the article                |      | passes                                                                                                                                                   |
| `DEV-A11Y-042` | `a11y.spec.ts` | The skip link is the first focusable element and lands in the content, on every page type |      | **fails**: the homepage's skip-link target `main#content` is not focusable (needs `tabindex="-1"`; W11 home template)                                    |
| `DEV-A11Y-043` | `a11y.spec.ts` | The response status dot has a text alternative                                            |      | passes                                                                                                                                                   |
| `DEV-A11Y-050` | `a11y.spec.ts` | The links menu opens with Enter, closes with Escape and returns focus                     |      | passes                                                                                                                                                   |
| `DEV-A11Y-051` | `a11y.spec.ts` | Search opens with the keyboard, results are reachable with arrows, Escape returns focus   |      | passes                                                                                                                                                   |
| `DEV-A11Y-052` | `a11y.spec.ts` | The Copy Page menu works from the keyboard and returns focus                              |      | **fails**: opening the Copy Page menu with Enter does not move focus into it, so ArrowDown and Escape do nothing (W2 CopyPage)                           |
| `DEV-A11Y-053` | `a11y.spec.ts` | The "More Languages" menu works from the keyboard and returns focus                       |      | passes                                                                                                                                                   |
| `DEV-A11Y-054` | `a11y.spec.ts` | The Headers modal traps focus, closes with Escape and returns focus                       |      | **fails**: closing the Headers modal does not return focus to the Headers button (W3 Playground)                                                         |
| `DEV-A11Y-055` | `a11y.spec.ts` | The image lightbox opens with Enter and closes with Escape, returning focus               |      | passes                                                                                                                                                   |
| `DEV-A11Y-056` | `a11y.spec.ts` | The feedback popover opens and closes from the keyboard                                   |      | passes                                                                                                                                                   |
| `DEV-A11Y-057` | `a11y.spec.ts` | Sidebar groups toggle from the keyboard                                                   |      | passes                                                                                                                                                   |
| `DEV-A11Y-060` | `a11y.spec.ts` | The mobile drawer and sub-nav, open, have no violation and close with Escape              |      | **fails**: axe: mobile sub-nav label contrast (W2 PortalHeader)                                                                                          |

## Exceptions

None are registered: every axe run expects zero violations (WCAG 2.0, 2.1 and 2.2 A and AA, the gallery's tag set).
One adaptation of the runner, not of the expectation: on pages with HTML blocks (sandboxed frames without
`allow-scripts`, PLAN §2.12) axe cannot inject itself into those frames, so `axeViolations()` runs in legacy mode
there and checks the page and the frames' titles, not the author's HTML inside them.
