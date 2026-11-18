# Developers Forms: E2E tests

The contact page (`/page/contact-us`): its Formstack frame and links, the project-submission and Discord signup form links, and the Discord button (`contact_page`).

IDs: `DEV-FORM-NNN`. Lands in phase 3 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersDocs()`, `pm.onDevelopersShell()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/forms/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/forms/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/forms/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Forms, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- Every request to Formstack is intercepted (`pm.onDevelopersDocs().interceptFormstack()`); nothing is ever submitted.

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 9 of 9 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID             | Spec file         | What it asserts                                                                     | Tags | Local run |
| -------------- | ----------------- | ----------------------------------------------------------------------------------- | ---- | --------- |
| `DEV-FORM-001` | `contact.spec.ts` | The contact page shows its title, its text and the Formstack frame                  |      | passes    |
| `DEV-FORM-002` | `contact.spec.ts` | The frame has an accessible title                                                   |      | passes    |
| `DEV-FORM-003` | `contact.spec.ts` | The frame's requests are answered locally; nothing reaches Formstack                |      | passes    |
| `DEV-FORM-004` | `contact.spec.ts` | The project-submission link points at the Powered-by-Sefaria form                   |      | passes    |
| `DEV-FORM-005` | `contact.spec.ts` | The contact page carries "Join our Discord" below the form                          |      | passes    |
| `DEV-FORM-006` | `contact.spec.ts` | The contact-page Discord click is reported with placement contact_page              |      | passes    |
| `DEV-FORM-007` | `contact.spec.ts` | "Get in Touch" is the active tab on the contact page                                |      | passes    |
| `DEV-FORM-008` | `contact.spec.ts` | The "Contact us" links in the docs lead to the contact page                         |      | passes    |
| `DEV-FORM-009` | `contact.spec.ts` | The contact page answers with the CSP that allows only Formstack and YouTube frames |      | passes    |
