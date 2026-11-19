# Developers Reference: E2E tests

Every endpoint-page interaction of brief §4.3 outside Try It (PLAN §6.2 A to D, and F): the sidebar, parameters, responses, code samples, anchors, the tags popover, prev/next, "Updated", the feedback widget, Cmd-/ and the Discord button in the request panel (`reference_request_panel`).

IDs: `DEV-REF-NNN`. Lands in phase 2 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersReference()`, `pm.onDevelopersShell()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/reference/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/reference/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/reference/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Reference, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- The feedback POST is always intercepted (`pm.onDevelopersShell().interceptFeedback()`).

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 46 of 46 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID            | Spec file                | What it asserts                                                                                 | Tags            | Local run |
| ------------- | ------------------------ | ----------------------------------------------------------------------------------------------- | --------------- | --------- |
| `DEV-REF-001` | `endpoint.spec.ts`       | /reference/get-v3-texts renders its title, method badge, parameters and the request panel       | `@sanity` `@pr` | passes    |
| `DEV-REF-002` | `endpoint.spec.ts`       | The URL line shows the server and the path template                                             |                 | passes    |
| `DEV-REF-003` | `endpoint.spec.ts`       | The document title is the operation summary                                                     |                 | passes    |
| `DEV-REF-004` | `endpoint.spec.ts`       | The tag button opens a popover naming the operation's tag                                       |                 | passes    |
| `DEV-REF-010` | `endpoint.spec.ts`       | A text input is prefilled with its default and labelled with type, required and default         |                 | passes    |
| `DEV-REF-011` | `endpoint.spec.ts`       | An optional text input shows its first example as the placeholder                               |                 | passes    |
| `DEV-REF-012` | `endpoint.spec.ts`       | An enum shows a select and "Allowed:" chips                                                     |                 | passes    |
| `DEV-REF-013` | `endpoint.spec.ts`       | Clicking an "Allowed:" chip copies its value without changing the select                        |                 | passes    |
| `DEV-REF-014` | `endpoint.spec.ts`       | Choosing an enum value updates the code sample                                                  |                 | passes    |
| `DEV-REF-015` | `endpoint.spec.ts`       | An input with examples lists "Use example value" entries on focus                               |                 | passes    |
| `DEV-REF-016` | `endpoint.spec.ts`       | Each parameter and each section has an anchor                                                   |                 | passes    |
| `DEV-REF-017` | `endpoint.spec.ts`       | Clicking the {tref} chip focuses its input; typing replaces the chip and updates the sample     |                 | passes    |
| `DEV-REF-018` | `endpoint.spec.ts`       | A POST page has body params whose object expands with "+" to its fields                         |                 | passes    |
| `DEV-REF-019` | `endpoint.spec.ts`       | Tab from an input with examples closes its list and moves on to the next field, as on live      |                 | passes    |
| `DEV-REF-020` | `endpoint.spec.ts`       | The responses heading reads "Response" for one status code                                      |                 | passes    |
| `DEV-REF-021` | `endpoint.spec.ts`       | Each status is an accordion with a coloured dot; it opens and closes                            |                 | passes    |
| `DEV-REF-022` | `endpoint.spec.ts`       | An expanded status shows "Response body", its type and its properties                           |                 | passes    |
| `DEV-REF-023` | `endpoint.spec.ts`       | Arrays of objects show their item properties in sub-cards                                       |                 | passes    |
| `DEV-REF-024` | `endpoint.spec.ts`       | A nested array sits behind an expander that closes with ✕                                       |                 | passes    |
| `DEV-REF-025` | `endpoint.spec.ts`       | The response panel shows the first example on load                                              |                 | passes    |
| `DEV-REF-026` | `endpoint.spec.ts`       | The status dropdown lists the examples and "Clear Example"; clearing shows the example chips    |                 | passes    |
| `DEV-REF-027` | `endpoint.spec.ts`       | A union type offers a variant select                                                            |                 | passes    |
| `DEV-REF-030` | `endpoint.spec.ts`       | Shell is selected on load; the "⋯" menu has 18 entries starting with "Agent Prompt"             |                 | passes    |
| `DEV-REF-031` | `endpoint.spec.ts`       | The request card's header button opens the library menu for the language                        |                 | passes    |
| `DEV-REF-032` | `endpoint.spec.ts`       | The chosen language and library survive a reload                                                |                 | passes    |
| `DEV-REF-033` | `endpoint.spec.ts`       | The copy button copies the sample and shows "Copied!"                                           |                 | passes    |
| `DEV-REF-034` | `endpoint.spec.ts`       | Each language changes the sample                                                                |                 | passes    |
| `DEV-REF-035` | `endpoint.spec.ts`       | POST pages offer an "Examples" dropdown of request bodies; GET pages do not                     |                 | passes    |
| `DEV-REF-040` | `endpoint.spec.ts`       | "Updated N ago" shows a relative time                                                           |                 | passes    |
| `DEV-REF-041` | `endpoint.spec.ts`       | Prev/next follow the flattened sidebar order and skip group rows                                |                 | passes    |
| `DEV-REF-042` | `endpoint.spec.ts`       | Feedback on an endpoint page posts its path                                                     |                 | passes    |
| `DEV-REF-043` | `endpoint.spec.ts`       | The request panel carries "Join our Discord"                                                    |                 | passes    |
| `DEV-REF-044` | `endpoint.spec.ts`       | A deprecated endpoint shows its marker on the page and in the sidebar                           |                 | passes    |
| `DEV-REF-050` | `sidebar-layout.spec.ts` | The sidebar is 288px wide and stays in place while the article scrolls                          |                 | passes    |
| `DEV-REF-051` | `sidebar-layout.spec.ts` | On load only the group containing the current page is open                                      |                 | passes    |
| `DEV-REF-052` | `sidebar-layout.spec.ts` | Other groups open and close on click                                                            |                 | passes    |
| `DEV-REF-053` | `sidebar-layout.spec.ts` | Both "Index" groups exist                                                                       |                 | passes    |
| `DEV-REF-054` | `sidebar-layout.spec.ts` | Section headings are upper-case                                                                 |                 | passes    |
| `DEV-REF-055` | `sidebar-layout.spec.ts` | Endpoint rows carry their method pill; get-v1-texts and get-topic-slug show the deprecated icon |                 | passes    |
| `DEV-REF-056` | `sidebar-layout.spec.ts` | The filter narrows the tree as you type                                                         |                 | passes    |
| `DEV-REF-057` | `sidebar-layout.spec.ts` | Cmd-/ or Ctrl-/ focuses the filter                                                              |                 | passes    |
| `DEV-REF-058` | `sidebar-layout.spec.ts` | The collapse control hides the sidebar and the choice survives a reload                         |                 | passes    |
| `DEV-REF-059` | `sidebar-layout.spec.ts` | At 1070px the article narrows to 292px beside the playground                                    |                 | passes    |
| `DEV-REF-060` | `sidebar-layout.spec.ts` | At 1065px and below the playground moves under the article                                      |                 | passes    |
| `DEV-REF-061` | `sidebar-layout.spec.ts` | At 768px the sidebar is replaced by the mobile header's dropdown                                |                 | passes    |
| `DEV-REF-062` | `sidebar-layout.spec.ts` | The tag group address answers 302 to its first visible child                                    |                 | passes    |
