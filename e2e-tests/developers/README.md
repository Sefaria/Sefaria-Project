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
