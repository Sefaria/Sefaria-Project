# Developers Editor: E2E tests

The staff-only editor (brief §4.6, PLAN §2.11): the page tree, drag reorder, new page and child, every block through the slash menu, settings, overlay fields, revisions and restore, draft and publish, image upload, and permission denial for anonymous and non-staff visitors.

IDs: `DEV-EDIT-NNN`. Lands in phase 7 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersEditor()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/editor/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/editor/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/editor/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Editor, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- Sandboxes share one database. Tests intercept writes (`pm.onDevelopersEditor().interceptEditorWrites()`) unless they are this folder's real-write tests: those run only in the `*-developers` projects, create hidden pages whose slugs start with `e2e-<run id>-`, and delete them in `afterEach` (`devportal_purge_e2e` removes leftovers after a day). Staff tests log in with `BROWSER_SETTINGS.enAdmin`.

## Test IDs

| ID  | Spec file | What it asserts | Tags |
| --- | --------- | --------------- | ---- |
