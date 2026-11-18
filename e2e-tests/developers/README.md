# Developer portal: E2E tests

Playwright suites for the developer portal on the `developers.` host (`MODULE_URLS.EN.DEVELOPERS`). One folder per area, each with a README and an ID table. Plan: `docs/dev-portal/PLAN.md` §5.2. Page objects: `e2e-tests/pages/developers/`, listed in `devportal/contracts/C7_page_objects.md`.

## Projects

| Config                                  | Projects                                                                     | Tests                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `playwright.config.ts`                  | `chrome-developers`, `firefox-developers`, `safari-developers`               | `e2e-tests/developers/**`                                 |
| `playwright.mobileweb.config.ts`        | `chrome-mobile-developers` (Pixel 5), `safari-mobile-developers` (iPhone 13) | `e2e-tests/mobile web/developers/**`                      |
| `playwright.devportal-visual.config.ts` | `visual-1440`, `visual-1280`, `visual-1024`, `visual-768`, `visual-390`      | `e2e-tests/developers-visual/**`                          |
| `playwright.bdd.config.ts`              | `chrome-bdd`, `chrome-bdd-mobile`                                            | Product's stories in `feature-specs/features/developers/` |

The developers URL resolves as: `E2E_DEVELOPERS_URL`; for a local `SANDBOX_URL`, its `developers.` sub-host (`http://developers.localhost:8000`); otherwise `https://developers.<SANDBOX_DOMAIN>`. The desktop and mobile developers projects are registered only when that host is known to be reachable (`E2E_DEVELOPERS_URL` set, or `SANDBOX_URL` is localhost or a public hostname), so the merge-queue run against an in-cluster URL does not include them (DC-3). Under the same condition, the tag-scoped `*-sanity`, `mobile-sanity` and `chrome-pr` projects include this tree's `@sanity` and `@pr` tests; otherwise they skip it.

## Areas

| Folder                            | IDs                   | Phase  |
| --------------------------------- | --------------------- | ------ |
| [shell/](shell/README.md)         | `DEV-HDR-`            | 1      |
| [reference/](reference/README.md) | `DEV-REF-`            | 2      |
| [try-it/](try-it/README.md)       | `DEV-TRY-`            | 2      |
| [docs/](docs/README.md)           | `DEV-DOC-`            | 3      |
| [forms/](forms/README.md)         | `DEV-FORM-`           | 3      |
| [search/](search/README.md)       | `DEV-SRCH-`           | 4      |
| [agent/](agent/README.md)         | `DEV-AI-`, `DEV-MCP-` | 4      |
| [home/](home/README.md)           | `DEV-HOME-`           | 5      |
| [analytics/](analytics/README.md) | `DEV-GA-`             | 5      |
| [gallery/](gallery/README.md)     | `DEV-GAL-`            | 6      |
| [editor/](editor/README.md)       | `DEV-EDIT-`           | 7      |
| [redirects/](redirects/README.md) | `DEV-RDR-`            | 8      |
| [a11y/](a11y/README.md)           | `DEV-A11Y-`           | 2 to 8 |
| [security/](security/README.md)   | `DEV-SEC-`            | 1 to 8 |

## Shared helpers (W14)

- `developers-entry.ts`: `enterPortal(context, path)` (the house entry, `goToPageWithLang`, on an absolute developers URL), `enterBlank(context)` (enters on `/robots.txt`, a page that loads no script, so a test can install interceptors such as `captureAnalytics()`, `fulfillApiWith()` or `interceptFormstack()` before the page under test loads), `stubExternalSites()` (a new tab to GitHub or Formstack is answered locally), `flattenedSidebarOrder()` (the order prev/next follow, from `/_portal/nav/<section>.json`), `readRepoJson()`, and the test data: `DOC_PAGES` (one real page per Markdown component, found by rendering every seeded page) and `ENDPOINTS`, plus the recorded Try It responses.
- `editor/editor-entry.ts`: signing in as staff or as a non-staff account (see `editor/README.md`).
- Page-object methods added beyond C7 are marked "Added by W14" in their doc comment; no C7 signature changed.

## Writes and third parties

Nothing in these suites writes to the shared database except the editor suite's "real writes" group (hidden `e2e-<run id>-…` pages, deleted in `afterEach`; never `@pr`). The feedback POST, editor saves on shared pages, uploads and every Formstack request are intercepted. Try It is answered with recorded responses (`fulfillApiWith`) except `DEV-TRY-001`, which calls production as PLAN §5.2.3 asks. GA4 hits are intercepted (`captureAnalytics`); when gtag.js cannot be fetched (an offline sandbox) a stand-in that sends the same `g/collect` hits is served, so nothing reaches Google either way. External tabs (GitHub, Formstack, ChatGPT, Claude) are answered locally or aborted; deep links (`cursor:`, `vscode:`) are read from the request the browser makes, never opened.

## Local runs

How the W14 numbers in each folder's README were produced (standalone portal, no MongoDB):

```bash
DEVPORTAL_SQLITE_PATH=/tmp/dp.sqlite3 python manage.py migrate --settings=devportal.dev.settings_standalone   # seeds all content
(cd devportal-ui && npm ci && npm run build) && cp -r devportal-ui/dist static/bundles/devportal
DEVPORTAL_SQLITE_PATH=/tmp/dp.sqlite3 python manage.py runserver 127.0.0.1:8000 --settings=devportal.dev.settings_standalone
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers
npx playwright test --config=playwright.mobileweb.config.ts --project=chrome-mobile-developers
```

- Use `developers.localhost`, not `127.0.0.1`: `goToPageWithLang` sets a cookie on the parent domain, which an IP address does not have. Chromium resolves `*.localhost` itself; Node (Playwright's `request` API, used by `httpGet`) may not, in which case map the name in `/etc/hosts` or preload a resolver.
- The analytics suite needs a GA4 property in the payload: the standalone settings hard-code `DEVPORTAL_GA4 = {}`, so wrap them in a settings module that reads `DEVPORTAL_GA4` from the environment (for example `{"default":"G-TEST000001"}`). `DEV-GA-020` passes either way: with no property it asserts nothing is sent.
- Two servers on one SQLite file lock each other under the editor's writes: give each its own database copy, and run the editor's real-write group with `--workers=1` on SQLite (Postgres sandboxes have no such limit).
- Firefox and WebKit are not installed in the agent environment, so `firefox-developers`, `safari-developers` and `safari-mobile-developers` were not run locally.

## Phone projects (`mobile web/developers/`, W14)

`developers-mobile.spec.ts` runs in `chrome-mobile-developers` (Pixel 5) and `safari-mobile-developers` (iPhone 13).
IDs continue each area's series with an `M`: `DEV-HDR-M001`…, `DEV-DOC-M001`…, `DEV-SRCH-M001`, `DEV-HOME-M001`…,
`DEV-REF-M001`…, `DEV-A11Y-M001`. Every read-only test carries `@sanity` (PLAN §5.2.3). Local run (Pixel 5, Chromium):
12 of 13 pass; `DEV-A11Y-M001` fails on the mobile sub-nav label's contrast (W2 PortalHeader).

| ID              | What it asserts                                                                   |
| --------------- | --------------------------------------------------------------------------------- |
| `DEV-HDR-M001`  | The header shows the menu toggle; the drawer lists the six links and the products |
| `DEV-HDR-M002`  | The drawer closes again                                                           |
| `DEV-HDR-M003`  | A drawer link navigates                                                           |
| `DEV-HDR-M004`  | Docs, endpoint and contact pages do not scroll sideways                           |
| `DEV-DOC-M001`  | The sidebar becomes the dropdown under the header, named by the page              |
| `DEV-DOC-M002`  | Choosing a page in the dropdown opens it                                          |
| `DEV-DOC-M003`  | The table of contents is hidden on a phone                                        |
| `DEV-SRCH-M001` | Search opens from the header and finds pages                                      |
| `DEV-HOME-M001` | The hero keeps its spacing below the header (D-11)                                |
| `DEV-HOME-M002` | The six tiles and both Discord buttons are on the phone homepage                  |
| `DEV-REF-M001`  | On an endpoint page the playground sits under the article                         |
| `DEV-REF-M002`  | The endpoint sub-nav names the operation                                          |
| `DEV-A11Y-M001` | The phone layout, and the open drawer, have no WCAG A/AA violation                |
