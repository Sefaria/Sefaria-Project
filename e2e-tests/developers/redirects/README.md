# Developers Redirects: E2E tests

The redirect table (PLAN §2.4, contract C9) and the URL-parity crawl of PLAN §6.4.

IDs: `DEV-RDR-NNN`. Lands in phase 8 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersCopyPage()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/redirects/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/redirects/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/redirects/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Redirects, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- Use `pm.onDevelopersCopyPage().httpGet(path)`, which does not follow redirects, to assert the status and `Location`. This folder belongs to W17.

## Test IDs

| ID            | Spec file            | What it asserts                                                                               | Tags             |
| ------------- | -------------------- | --------------------------------------------------------------------------------------------- | ---------------- |
| `DEV-RDR-001` | `url-parity.spec.ts` | `/docs`, `/reference`, `/docs/getting-started` and `/v1.0/docs/welcome` redirect as specified | `@sanity`, `@pr` |
| `DEV-RDR-002` | `url-parity.spec.ts` | The 129 sitemap URLs answer as on live                                                        |                  |
| `DEV-RDR-003` | `url-parity.spec.ts` | The `llms.txt` page URLs answer as on live                                                    |                  |
| `DEV-RDR-004` | `url-parity.spec.ts` | The `.md` variant of every page answers as on live                                            |                  |
| `DEV-RDR-005` | `url-parity.spec.ts` | The machine and agent endpoints (SITE_ATLAS §1.3) answer as on live                           |                  |
| `DEV-RDR-006` | `url-parity.spec.ts` | The redirect and legacy-URL table (SITE_ATLAS §6) answers as on live                          |                  |
| `DEV-RDR-007` | `url-parity.spec.ts` | The developers URLs in the main site's `static/llms.txt` answer as on live                    |                  |
| `DEV-RDR-008` | `url-parity.spec.ts` | Hidden pages (and their `.md`) answer at their URLs as on live (I-6)                          |                  |
| `DEV-RDR-009` | `url-parity.spec.ts` | Extra trailing-slash and `/v1.0/...` variants answer as on live                               |                  |

## The URL list

`live-urls.json` holds one entry per path with the status, `Location` and content type live answered, recorded once (`recordedAt`) by `build_live_urls.py` with GET requests that do not follow redirects. Each entry lists the sources it came from. Four entries were rate-limited (429) on the first pass and re-requested once; they carry a `note`.

Its `deviations` table lists the paths where the portal answers differently on purpose, each with its reason:

- `/llms-full.txt`: 200 (new; live has none).
- `/login`: 302 to the library host's `/login` (PLAN §2.4), not to ReadMe's dashboard.
- `/logout`, `/suggested-edits/`: 404, ReadMe-only routes not carried over (contract C9 `parity_examples`).

Do not re-record the list to make a failure go away. A real live change is a new recording, reviewed as such.

The same list is checked without a browser by `devportal/tests/url_parity_test.py` (Django test client, vendored snapshot imported), so CI without a deployed host runs it too.
