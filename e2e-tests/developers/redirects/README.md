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

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |

Reserved for the `@sanity` / `@pr` core journeys (PLAN §5.2.3):

- `DEV-RDR-001`: `/docs`, `/reference`, `/docs/getting-started` and `/v1.0/docs/welcome` redirect as specified
