# Developers Security: E2E tests

The checks of PLAN §6.7 that need a browser: no cookies on Try It requests, the locked API origin, HTML in API responses shown as text and never executed, the CSP header, and no cookie set by anonymous page views.

IDs: `DEV-SEC-NNN`. Lands in phase 1 to 8 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersTryIt()`, `pm.onDevelopersCopyPage()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/security/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/security/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/security/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Security, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 28 of 28 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID            | Spec file          | What it asserts                                                                                                          | Tags | Local run |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---- | --------- |
| `DEV-SEC-001` | `security.spec.ts` | A Try It call carries no Cookie, Referer or credential, even with a staff session for the parent domain (S-1)            |      | passes    |
| `DEV-SEC-002` | `security.spec.ts` | No value a visitor types moves a Try It call off <origin>/api/ (S-2)                                                     |      | passes    |
| `DEV-SEC-003` | `security.spec.ts` | A hostile application/json response is shown as text; nothing executes or renders (S-3)                                  |      | passes    |
| `DEV-SEC-004` | `security.spec.ts` | A hostile text/html response is shown as text; nothing executes or renders (S-3)                                         |      | passes    |
| `DEV-SEC-005` | `security.spec.ts` | Every page type sends the C10 response headers                                                                           |      | passes    |
| `DEV-SEC-006` | `security.spec.ts` | A full interactive session across page types produces no CSP violation (S-4)                                             |      | passes    |
| `DEV-SEC-007` | `security.spec.ts` | An HTML block frame is sandboxed without scripts; opened directly it has the frame CSP (S-9)                             |      | passes    |
| `DEV-SEC-008` | `security.spec.ts` | Opening an HTML block's frame URL directly executes nothing (S-9)                                                        |      | passes    |
| `DEV-SEC-009` | `security.spec.ts` | Anonymous GETs of public routes set no cookie (S-12)                                                                     |      | passes    |
| `DEV-SEC-010` | `security.spec.ts` | Browsing every page type leaves no cookie of the portal's own in the browser (S-12)                                      |      | passes    |
| `DEV-SEC-011` | `security.spec.ts` | Recent Requests store only the C10 fields: no body, value or key (S-13)                                                  |      | passes    |
| `DEV-SEC-012` | `security.spec.ts` | A visitor's values never reach the developers host or analytics (S-13)                                                   |      | passes    |
| `DEV-SEC-013` | `security.spec.ts` | /v1.0// cannot redirect off the host (open redirect)                                                                     |      | passes    |
| `DEV-SEC-014` | `security.spec.ts` | The feedback endpoint refuses a POST without a CSRF token (S-14)                                                         |      | passes    |
| `DEV-SEC-020` | `security.spec.ts` | / sends the exact C10 CSP and an interactive session violates nothing (S-4)                                              |      | passes    |
| `DEV-SEC-021` | `security.spec.ts` | /docs/welcome sends the exact C10 CSP and an interactive session violates nothing (S-4)                                  |      | passes    |
| `DEV-SEC-022` | `security.spec.ts` | /docs/איך-ליצור-מראי-מקורות-להפניה sends the exact C10 CSP and an interactive session violates nothing (S-4)             |      | passes    |
| `DEV-SEC-023` | `security.spec.ts` | /page/contact-us sends the exact C10 CSP and an interactive session violates nothing (S-4)                               |      | passes    |
| `DEV-SEC-024` | `security.spec.ts` | /reference/getting-started sends the exact C10 CSP and an interactive session violates nothing (S-4)                     |      | passes    |
| `DEV-SEC-025` | `security.spec.ts` | /reference/get-v3-texts sends the exact C10 CSP and an interactive session violates nothing (S-4)                        |      | passes    |
| `DEV-SEC-026` | `security.spec.ts` | /reference/post-find-refs sends the exact C10 CSP and an interactive session violates nothing (S-4)                      |      | passes    |
| `DEV-SEC-027` | `security.spec.ts` | /powered-by sends the exact C10 CSP and an interactive session violates nothing (S-4)                                    |      | passes    |
| `DEV-SEC-028` | `security.spec.ts` | /powered-by/charts sends the exact C10 CSP and an interactive session violates nothing (S-4)                             |      | passes    |
| `DEV-SEC-029` | `security.spec.ts` | /powered-by/projects/156-tehillim-opening sends the exact C10 CSP and an interactive session violates nothing (S-4)      |      | passes    |
| `DEV-SEC-030` | `security.spec.ts` | /powered-by/projects/999999999-no-such-project sends the exact C10 CSP and an interactive session violates nothing (S-4) |      | passes    |
| `DEV-SEC-031` | `security.spec.ts` | /no-such-page-e2e sends the exact C10 CSP and an interactive session violates nothing (S-4)                              |      | passes    |
| `DEV-SEC-032` | `security.spec.ts` | /docs/no-such-page-e2e sends the exact C10 CSP and an interactive session violates nothing (S-4)                         |      | passes    |
| `DEV-SEC-040` | `security.spec.ts` | The editor sends the editor CSP and a short editing session violates nothing (S-4)                                       |      | passes    |
