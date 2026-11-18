# Developers Gallery: E2E tests

Every "Powered by Sefaria" gallery behavior (brief §4.8, PLAN §2.14): browse, search, filters (OR within a facet, AND across facets), the known-issues switch, sort, grid and list, URL state, Show more, the featured band, project pages, canonical-slug redirects, the 404, and the unlisted charts page. Ports the 7 Playwright specs of `Sefaria/powered-by` to the house rules.

IDs: `DEV-GAL-NNN`. Lands in phase 6 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersGallery()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/gallery/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/gallery/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/gallery/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Gallery, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- This folder belongs to W12 (the gallery port).

## Test IDs

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |

Reserved for the `@sanity` / `@pr` core journeys (PLAN §5.2.3):

- `DEV-GAL-001`: The gallery lists projects and a filter narrows them
- `DEV-GAL-002`: A project page opens from the gallery; an unknown id is a 404
