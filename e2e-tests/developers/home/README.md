# Developers Home: E2E tests

The homepage (brief §4.1): the hero, the carousel and its radio controls, the six tool tiles and their targets, the newsletter link, the community band, the mobile hero spacing, and the two Discord buttons (`home_hero`, `home_community`).

IDs: `DEV-HOME-NNN`. Lands in phase 5 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersHome()`, `pm.onDevelopersShell()` (every method is listed in `devportal/contracts/C7_page_objects.md`).

## How to run

The `*-developers` projects exist only when the developers host is known: `E2E_DEVELOPERS_URL` is set, or `SANDBOX_URL` is localhost or a public hostname.

```bash
# Against a local portal (http://developers.localhost:8000)
E2E_DEVELOPERS_URL=http://developers.localhost:8000 npx playwright test --project=chrome-developers e2e-tests/developers/home/

# All three desktop browsers
npx playwright test --project=chrome-developers --project=firefox-developers --project=safari-developers e2e-tests/developers/home/

# List without running
npx playwright test --project=chrome-developers --list e2e-tests/developers/home/
```

## Conventions

- One `kebab-case.spec.ts` per topic. Describe strings are `'Developers Home, English'`; test titles are `'<ID>: <description>'`.
- Enter with `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)` (or `goToPageWithUser`), then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).

## Test IDs

Local run (standalone portal, chrome-developers, see `../README.md` "Local runs"): 17 of 17 pass. A failing test is never skipped or weakened; the reason and the lane that owns the fix are in the last column.

| ID             | Spec file      | What it asserts                                                            | Tags            | Local run |
| -------------- | -------------- | -------------------------------------------------------------------------- | --------------- | --------- |
| `DEV-HOME-001` | `home.spec.ts` | The homepage loads with its hero title and six tiles                       | `@sanity` `@pr` | passes    |
| `DEV-HOME-002` | `home.spec.ts` | The document title is "Sefaria" and the Home tab is active                 |                 | passes    |
| `DEV-HOME-003` | `home.spec.ts` | The hero subtitle copies live                                              |                 | passes    |
| `DEV-HOME-004` | `home.spec.ts` | The hero code line ends on Ref("Shabbat 4b").all_segment_refs()            |                 | passes    |
| `DEV-HOME-005` | `home.spec.ts` | The six tiles and their targets, in live's order                           |                 | passes    |
| `DEV-HOME-006` | `home.spec.ts` | A same-site tile opens its page                                            |                 | passes    |
| `DEV-HOME-007` | `home.spec.ts` | Each internal tile target exists                                           |                 | passes    |
| `DEV-HOME-008` | `home.spec.ts` | The carousel has one radio control per featured project, the first checked |                 | passes    |
| `DEV-HOME-009` | `home.spec.ts` | Selecting a radio control moves the carousel                               |                 | passes    |
| `DEV-HOME-010` | `home.spec.ts` | Each card links to its project                                             |                 | passes    |
| `DEV-HOME-011` | `home.spec.ts` | The carousel button leads to the gallery                                   |                 | passes    |
| `DEV-HOME-012` | `home.spec.ts` | The newsletter band links to ActiveCampaign form 46                        |                 | passes    |
| `DEV-HOME-013` | `home.spec.ts` | The community band invites developers to Discord                           |                 | passes    |
| `DEV-HOME-014` | `home.spec.ts` | The hero carries the white "Join our Discord" button                       |                 | passes    |
| `DEV-HOME-015` | `home.spec.ts` | The community band carries the navy "Join our Discord" button              |                 | passes    |
| `DEV-HOME-016` | `home.spec.ts` | Both Discord clicks are reported with their placement                      |                 | passes    |
| `DEV-HOME-017` | `home.spec.ts` | The homepage has no sidebar and exactly one h1                             |                 | passes    |
