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

## Signing in (`editor-entry.ts`)

- **Sandbox:** `enterEditorAsStaff()` uses the `enAdmin` storage state global-setup writes (a library login; the session cookie is shared with the developers host); `enterAsNonStaff()` uses `enUser`. Note `e2e-tests/globals.ts`: UMN-007 logs `enAdmin` out every run, so a full-suite run that includes the User Menu suite can invalidate the staff session mid-run (a dedicated staff test account is the fix; see the W14 report).
- **Standalone portal** (no library host, so no Sefaria login): create the accounts in its SQLite database, then pass them in the environment.

  ```bash
  python manage.py shell --settings=devportal.dev.settings_standalone -c "
  from django.contrib.auth.models import User
  s, _ = User.objects.get_or_create(username='e2estaff'); s.is_staff = s.is_superuser = True; s.set_password('…'); s.save()
  u, _ = User.objects.get_or_create(username='e2euser'); u.set_password('…'); u.save()"
  export E2E_DEVPORTAL_STAFF_USERNAME=e2estaff E2E_DEVPORTAL_STAFF_PASSWORD=…
  ```

  Staff sign in through the developers host's Django admin login (`/admin/login/`, the standalone URLconf). That login admits staff only, so the non-staff refusal (`DEV-EDIT-002`) needs a session id of the non-staff account instead: create one with `django.contrib.sessions.backends.db.SessionStore` (set `_auth_user_id`, `_auth_user_backend`, `_auth_user_hash`) and export it as `E2E_DEVPORTAL_USER_SESSION`. `E2E_DEVPORTAL_STAFF_SESSION` works the same way for staff.

- With neither a storage state nor these variables the helper throws, so the test fails with the reason.
- On SQLite run the real-write group with `--workers=1`: concurrent writes otherwise fail with "database is locked" (a 500 on DELETE was traced to exactly that).

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 32 of 32 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID             | Spec file        | What it asserts                                                                | Tags | Local run |
| -------------- | ---------------- | ------------------------------------------------------------------------------ | ---- | --------- |
| `DEV-EDIT-001` | `editor.spec.ts` | An anonymous visitor is sent to the login page; the editor API answers 401     |      | passes    |
| `DEV-EDIT-002` | `editor.spec.ts` | A signed-in visitor who is not staff is refused                                |      | passes    |
| `DEV-EDIT-003` | `editor.spec.ts` | Staff get the editor                                                           |      | passes    |
| `DEV-EDIT-010` | `editor.spec.ts` | Each section has its page tree, with groups, endpoints and hidden pages marked |      | passes    |
| `DEV-EDIT-011` | `editor.spec.ts` | Opening a page shows its title, body and settings                              |      | passes    |
| `DEV-EDIT-012` | `editor.spec.ts` | View shows the server's rendering of the draft; Edit returns to the canvas     |      | passes    |
| `DEV-EDIT-013` | `editor.spec.ts` | An unknown construct is kept as raw Markdown, not dropped                      |      | passes    |
| `DEV-EDIT-014` | `editor.spec.ts` | The "/" menu offers every construct                                            |      | passes    |
| `DEV-EDIT-020` | `editor.spec.ts` | The "/" menu inserts a Callout                                                 |      | passes    |
| `DEV-EDIT-021` | `editor.spec.ts` | The "/" menu inserts a Image                                                   |      | passes    |
| `DEV-EDIT-022` | `editor.spec.ts` | The "/" menu inserts a Table                                                   |      | passes    |
| `DEV-EDIT-023` | `editor.spec.ts` | The "/" menu inserts a Embed                                                   |      | passes    |
| `DEV-EDIT-024` | `editor.spec.ts` | The "/" menu inserts a HTML Block                                              |      | passes    |
| `DEV-EDIT-025` | `editor.spec.ts` | The "/" menu inserts a Code Block                                              |      | passes    |
| `DEV-EDIT-026` | `editor.spec.ts` | The "/" menu inserts a Heading                                                 |      | passes    |
| `DEV-EDIT-027` | `editor.spec.ts` | The "/" menu inserts a Bulleted List                                           |      | passes    |
| `DEV-EDIT-028` | `editor.spec.ts` | The "/" menu inserts a Numbered List                                           |      | passes    |
| `DEV-EDIT-029` | `editor.spec.ts` | The "/" menu inserts a Quote                                                   |      | passes    |
| `DEV-EDIT-030` | `editor.spec.ts` | The "/" menu inserts a Divider                                                 |      | passes    |
| `DEV-EDIT-035` | `editor.spec.ts` | Saving sends the base revision and the edited content (intercepted)            |      | passes    |
| `DEV-EDIT-036` | `editor.spec.ts` | An endpoint shows the spec read-only and edits only the overlay (intercepted)  |      | passes    |
| `DEV-EDIT-037` | `editor.spec.ts` | An image is uploaded through the image block (intercepted)                     |      | passes    |
| `DEV-EDIT-038` | `editor.spec.ts` | The editor page has no accessibility violation                                 |      | passes    |
| `DEV-EDIT-040` | `editor.spec.ts` | "+ New page" creates an unpublished page that visitors cannot see              |      | passes    |
| `DEV-EDIT-041` | `editor.spec.ts` | A draft is not public; publishing makes it public                              |      | passes    |
| `DEV-EDIT-042` | `editor.spec.ts` | Visitors keep seeing the published version while a newer draft exists          |      | passes    |
| `DEV-EDIT-043` | `editor.spec.ts` | Revision history lists revisions newest first; restoring creates a new draft   |      | passes    |
| `DEV-EDIT-044` | `editor.spec.ts` | "+ add child" creates a page under another                                     |      | passes    |
| `DEV-EDIT-045` | `editor.spec.ts` | Dragging a row reorders the tree, and the order is saved                       |      | passes    |
| `DEV-EDIT-046` | `editor.spec.ts` | Settings are saved: subtitle and SEO fields                                    |      | passes    |
| `DEV-EDIT-047` | `editor.spec.ts` | Changing a published page's slug redirects the old address                     |      | passes    |
| `DEV-EDIT-048` | `editor.spec.ts` | Editing the title updates the tree and the public page                         |      | passes    |
