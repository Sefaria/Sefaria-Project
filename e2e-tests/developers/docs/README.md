# Developers Docs: E2E tests

Each Markdown component of PLAN §2.6 on a real page, the table of contents and scroll spy, heading anchors, the image lightbox, the right-to-left Hebrew page, hidden and deprecated pages, link pages, and the Discord buttons in the sidebar footer (`sidebar_footer`) and at the end of a page (`docs_page_end`).

IDs: `DEV-DOC-NNN`. Lands in phase 3 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersDocs()`, `pm.onDevelopersShell()`, `pm.onDevelopersCopyPage()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/docs/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/docs/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/docs/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Docs, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 35 of 35 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID            | Spec file            | What it asserts                                                                         | Tags            | Local run |
| ------------- | -------------------- | --------------------------------------------------------------------------------------- | --------------- | --------- |
| `DEV-DOC-001` | `docs-page.spec.ts`  | /docs/welcome renders its title, a callout and the sidebar                              | `@sanity` `@pr` | passes    |
| `DEV-DOC-002` | `docs-page.spec.ts`  | The excerpt sits under the title and the document title is the page title               |                 | passes    |
| `DEV-DOC-003` | `docs-page.spec.ts`  | Three columns: sidebar, article and a right rail with the table of contents             |                 | passes    |
| `DEV-DOC-004` | `docs-page.spec.ts`  | The right rail holds Copy Page above the table of contents                              |                 | passes    |
| `DEV-DOC-005` | `docs-page.spec.ts`  | The table of contents marks the current section while scrolling                         |                 | passes    |
| `DEV-DOC-006` | `docs-page.spec.ts`  | Choosing a table-of-contents entry jumps to its heading                                 |                 | passes    |
| `DEV-DOC-007` | `docs-page.spec.ts`  | Headings show an anchor link on hover and carry stable ids                              |                 | passes    |
| `DEV-DOC-008` | `docs-page.spec.ts`  | A #hash in the address scrolls to its heading on load                                   |                 | passes    |
| `DEV-DOC-009` | `docs-page.spec.ts`  | "Updated N ago" shows a relative time                                                   |                 | passes    |
| `DEV-DOC-010` | `docs-page.spec.ts`  | Prev/next follow the flattened sidebar order                                            |                 | passes    |
| `DEV-DOC-011` | `docs-page.spec.ts`  | Next goes to the next page and Previous comes back                                      |                 | passes    |
| `DEV-DOC-012` | `docs-page.spec.ts`  | Prev/next skip external link items ("Sefaria GitHub")                                   |                 | passes    |
| `DEV-DOC-013` | `docs-page.spec.ts`  | "Did this page help you?" opens a comment box and votes through the feedback endpoint   |                 | passes    |
| `DEV-DOC-014` | `docs-page.spec.ts`  | Answering Yes also opens the comment box                                                |                 | passes    |
| `DEV-DOC-015` | `docs-page.spec.ts`  | The sidebar footer and the end of the page carry "Join our Discord"                     |                 | passes    |
| `DEV-DOC-016` | `docs-page.spec.ts`  | Only the group of the current page is open on load                                      |                 | passes    |
| `DEV-DOC-017` | `docs-page.spec.ts`  | Sidebar groups open and close on click                                                  |                 | passes    |
| `DEV-DOC-018` | `docs-page.spec.ts`  | A sidebar link item shows the external arrow and opens its target in a new tab          |                 | passes    |
| `DEV-DOC-019` | `docs-page.spec.ts`  | Clicking a sidebar row navigates in place and moves the current marker                  |                 | passes    |
| `DEV-DOC-020` | `docs-page.spec.ts`  | Sidebar section headings are upper-cased                                                |                 | passes    |
| `DEV-DOC-021` | `docs-page.spec.ts`  | A deprecated doc shows the deprecated marker in the sidebar                             |                 | passes    |
| `DEV-DOC-022` | `docs-page.spec.ts`  | A hidden page is served but listed nowhere in the sidebar                               |                 | passes    |
| `DEV-DOC-030` | `components.spec.ts` | Callouts show their emoji and theme                                                     |                 | passes    |
| `DEV-DOC-031` | `components.spec.ts` | Titled code blocks show their tab label; plain blocks have none                         |                 | passes    |
| `DEV-DOC-032` | `components.spec.ts` | The copy button of a code block copies it and says "Copied!"                            |                 | passes    |
| `DEV-DOC-033` | `components.spec.ts` | Captioned images render with their caption                                              |                 | passes    |
| `DEV-DOC-034` | `components.spec.ts` | An image opens a lightbox that closes with its Close button and with Escape             |                 | passes    |
| `DEV-DOC-035` | `components.spec.ts` | Tables render as tables                                                                 |                 | passes    |
| `DEV-DOC-036` | `components.spec.ts` | YouTube embeds use the no-cookie player and carry a title                               |                 | passes    |
| `DEV-DOC-037` | `components.spec.ts` | HTML blocks are sandboxed frames without scripts                                        |                 | passes    |
| `DEV-DOC-038` | `components.spec.ts` | The Hebrew page reads right to left                                                     |                 | passes    |
| `DEV-DOC-039` | `components.spec.ts` | English pages read left to right                                                        |                 | passes    |
| `DEV-DOC-040` | `components.spec.ts` | Article links are in-portal paths or deliberate external targets, never files.readme.io |                 | passes    |
| `DEV-DOC-041` | `components.spec.ts` | An in-article link opens its page                                                       |                 | passes    |
| `DEV-DOC-042` | `components.spec.ts` | A guide page in the reference section renders like a docs page                          |                 | passes    |
