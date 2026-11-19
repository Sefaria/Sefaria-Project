# Developers Gallery: E2E tests

Every "Powered by Sefaria" gallery behavior (brief §4.8, PLAN §2.14): browse, search, filters (OR within a facet, AND across facets), the known-issues switch, sort, grid and list, URL state, Show more, the featured band, project pages, canonical-slug redirects, the 404, and the unlisted charts page. Re-expresses all 64 Playwright tests of `Sefaria/powered-by` (its 7 specs in `e2e/`, including `screenshots.spec.ts` and the axe checks) under the house rules, plus the server checks of the port.

IDs: `DEV-GAL-NNN`. Lands in phase 6 of `docs/dev-portal/PLAN.md` (§5.2.2). Page objects: `pm.onDevelopersGallery()` (every method is listed in `devportal/contracts/C7_page_objects.md`; the methods added for this port are marked in the page object's source).

## Data

The gallery's own suite ran against a snapshot of `GET /api/powered-by` so its counts are deterministic (122 visible projects, 134 with known issues). These suites keep that: `enterGallery()` (`gallery-entry.ts`) answers the API's GET from `devportal-ui/src/gallery/lib/__fixtures__/projects.json` through `serveGalleryFixture()` before the first navigation, and blocks GA4. Nothing here writes. `gallery-sanity.spec.ts` and `server.spec.ts` use the real data and assert on structure.

## Widths

The original suite ran each test in a desktop (1440x900) and a mobile (Pixel 7, 390x844) project. The gallery switches layout by viewport width only (sidebar from 1024px, sheet below), so tests with a mobile branch run twice here, with `test.use({ viewport })`, and say which layout in the title: `(sidebar)` / `(sheet)`, `(desktop)` / `(390px)`. The project-page tests keep the original's own 1280, 834 and 390 viewports.

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

- One `kebab-case.spec.ts` per topic. Describe strings start `'Developers Gallery, English'`; test titles are `'<ID>: <description>'`.
- Enter with `enterGallery(context, path)` (the snapshot, then `goToPageWithLang`) or `goToPageWithLang(context, developersUrl(path), LANGUAGES.EN)`, then `new PageManager(page, LANGUAGES.EN)`. Use absolute URLs: the `*-sanity` and `chrome-pr` projects run this folder's tagged tests under the Library baseURL.
- The house rules of `e2e-tests/CLAUDE.md` apply: page objects only, `t()` on every timeout, role then label then text then test id then CSS, no `waitForTimeout` to wait for state, adapt to the data instead of `test.skip`, intercept writes with `page.route`, pass at full parallelism.
- axe runs with the gallery's own tag set (WCAG 2.0, 2.1 and 2.2 A/AA), through `pm.onDevelopersGallery().axeViolations()`.
- Read-only, English-only core journeys carry `{ tag: ['@sanity', '@pr'] }` (PLAN §5.2.3).
- This folder belongs to W12 (the gallery port).

## Test IDs

| ID              | Spec file                | What it asserts                                                                                               | Tags            |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------- |
| `DEV-GAL-001`   | `gallery-sanity.spec.ts` | The gallery lists projects and a category filter narrows them (real data)                                     | `@sanity` `@pr` |
| `DEV-GAL-002`   | `gallery-sanity.spec.ts` | A project page opens from the gallery; an unknown id is a 404 (status and view)                               | `@sanity` `@pr` |
| `DEV-GAL-010`   | `browse.spec.ts`         | Search, filter, list view, open a project, Back restores them (sidebar, sheet)                                |                 |
| `DEV-GAL-011`   | `browse.spec.ts`         | An old `?project=<id>` link goes to the project page                                                          |                 |
| `DEV-GAL-012`   | `browse.spec.ts`         | An unknown `?project=` id is ignored                                                                          |                 |
| `DEV-GAL-013`   | `browse.spec.ts`         | Show more appends 24 and focuses the first new card                                                           |                 |
| `DEV-GAL-014`   | `browse.spec.ts`         | The filter sheet discards on close and applies on Show                                                        |                 |
| `DEV-GAL-015`   | `browse.spec.ts`         | The empty state clears filters                                                                                |                 |
| `DEV-GAL-016`   | `browse.spec.ts`         | An unknown gallery path answers 404 and shows the gallery's not-found page                                    |                 |
| `DEV-GAL-017`   | `browse.spec.ts`         | axe: browse, list, project page, filter sheet (sidebar, sheet)                                                |                 |
| `DEV-GAL-020`   | `filters.spec.ts`        | Topic + language + built-with combine: results, chips, badge, URL; chip removal and Clear all (both layouts)  |                 |
| `DEV-GAL-021`   | `filters.spec.ts`        | OR within a section: two topics match either (both layouts)                                                   |                 |
| `DEV-GAL-022`   | `filters.spec.ts`        | Sections start collapsed and open from a selection in the URL (both layouts)                                  |                 |
| `DEV-GAL-023`   | `filters.spec.ts`        | Show all expands a long list; Filter topics narrows it (both layouts)                                         |                 |
| `DEV-GAL-024`   | `filters.spec.ts`        | The sheet holds a pending selection with a live "Show N", discarded on close                                  |                 |
| `DEV-GAL-025`   | `filters.spec.ts`        | Known issues hidden by default, shown without a badge when switched on (both layouts)                         |                 |
| `DEV-GAL-026`   | `filters.spec.ts`        | Filter counts follow the known-issues switch (both layouts)                                                   |                 |
| `DEV-GAL-027`   | `filters.spec.ts`        | A known-issues project opens from its arrow; notice above "Open anyway"                                       |                 |
| `DEV-GAL-028`   | `filters.spec.ts`        | A known-issues project page works with the switch off (both layouts)                                          |                 |
| `DEV-GAL-029`   | `filters.spec.ts`        | The empty state offers Clear filters                                                                          |                 |
| `DEV-GAL-030`   | `filters.spec.ts`        | axe with every section open (both layouts)                                                                    |                 |
| `DEV-GAL-040`   | `featured.spec.ts`       | No band while no project is featured                                                                          |                 |
| `DEV-GAL-041`   | `featured.spec.ts`       | Clicking "Made with" opens the project                                                                        |                 |
| `DEV-GAL-042`   | `featured.spec.ts`       | Up to 3 featured, newest first, above "Browse projects", no tags                                              |                 |
| `DEV-GAL-043`   | `featured.spec.ts`       | 3-column grid from 900px, scroll-snap row below                                                               |                 |
| `DEV-GAL-044`   | `featured.spec.ts`       | A featured card opens its page; Back returns to the band                                                      |                 |
| `DEV-GAL-045`   | `featured.spec.ts`       | Never features a buggy project, even with known issues shown                                                  |                 |
| `DEV-GAL-046`   | `featured.spec.ts`       | The band ignores search and filters                                                                           |                 |
| `DEV-GAL-047`   | `featured.spec.ts`       | axe with the band showing                                                                                     |                 |
| `DEV-GAL-048`   | `featured.spec.ts`       | A featured known-issues project alone leaves no band                                                          |                 |
| `DEV-GAL-050`   | `project-page.spec.ts`   | Deep link, title, and a stale slug redirects to the canonical one (1280, 834, 390)                            |                 |
| `DEV-GAL-051`   | `project-page.spec.ts`   | Unknown id shows "Project not found"; All projects goes to the gallery root (1280, 834, 390)                  |                 |
| `DEV-GAL-052`   | `project-page.spec.ts`   | The open panel: side card, inline panel, bottom bar (1280, 834, 390)                                          |                 |
| `DEV-GAL-053`   | `project-page.spec.ts`   | The bottom bar never covers the details (390)                                                                 |                 |
| `DEV-GAL-054`   | `project-page.spec.ts`   | Known-issues notice and "Open anyway" (1280, 834, 390)                                                        |                 |
| `DEV-GAL-055`   | `project-page.spec.ts`   | axe on a project page and a known-issues page (1280, 834, 390)                                                |                 |
| `DEV-GAL-056`   | `project-page.spec.ts`   | Back restores filters, sort and scroll (1280, 834, 390)                                                       |                 |
| `DEV-GAL-057`   | `project-page.spec.ts`   | "All projects" goes to the gallery root when opened directly (1280, 834, 390)                                 |                 |
| `DEV-GAL-060`   | `charts.spec.ts`         | 8 charts drawn, noindex, title, and no link to the charts page                                                |                 |
| `DEV-GAL-061`   | `charts.spec.ts`         | The table alternative shows the same numbers                                                                  |                 |
| `DEV-GAL-062`   | `charts.spec.ts`         | Charts page: no horizontal scroll, axe                                                                        |                 |
| `DEV-GAL-070`   | `layout.spec.ts`         | 44x44 touch targets: grid, list, whole page scrolled (desktop, 390px)                                         |                 |
| `DEV-GAL-071`   | `layout.spec.ts`         | 44x44 touch targets: project page, filter sheet (desktop, 390px)                                              |                 |
| `DEV-GAL-072`   | `layout.spec.ts`         | 44x44 touch targets: featured band, every filter section expanded (desktop, 390px)                            |                 |
| `DEV-GAL-073`   | `layout.spec.ts`         | 44x44 touch targets: charts page (desktop, 390px)                                                             |                 |
| `DEV-GAL-074`   | `layout.spec.ts`         | No horizontal page scroll at 320, 360, 390, 768, 1024, 1440                                                   |                 |
| `DEV-GAL-075`   | `layout.spec.ts`         | The Talmud quote never overlaps the hero copy or buttons (1100 to 1440)                                       |                 |
| `DEV-GAL-076`   | `layout.spec.ts`         | The quote is absolute from 1100px and in flow below                                                           |                 |
| `DEV-GAL-077`   | `layout.spec.ts`         | Card tag rows stay on one line                                                                                |                 |
| `DEV-GAL-078`   | `layout.spec.ts`         | "Submit a project" (gallery bar) opens the form in a new tab; the footer has none; Donate opens a new tab     |                 |
| `DEV-GAL-079`   | `layout.spec.ts`         | At 390px it reads "Submit", sits before Donate, nothing overflows                                             |                 |
| `DEV-GAL-080`   | `layout.spec.ts`         | From 721px the label is "Submit a project"                                                                    |                 |
| `DEV-GAL-081`   | `layout.spec.ts`         | The gallery bar is flush with both container edges (1024, 1440, 1920)                                         |                 |
| `DEV-GAL-082`   | `layout.spec.ts`         | axe on the gallery bar                                                                                        |                 |
| `DEV-GAL-090`.. | `screens.spec.ts`        | 090 to 096 at 360, 390, 768, 1024, 1440: browse grid, list, filters, project page, empty state, charts, bar   |                 |
| `DEV-GAL-097`.. | `screens.spec.ts`        | 097 to 100 at 1440 and 390: featured band, category icon colors, expanded filters, known-issues card and page |                 |
| `DEV-GAL-101`   | `screens.spec.ts`        | Project page and known-issues page at 1280, 834, 390 (screenshots attached to the report)                     |                 |
| `DEV-GAL-110`   | `server.spec.ts`         | A stale project slug answers 301 to the canonical slug (real data)                                            |                 |
| `DEV-GAL-111`   | `server.spec.ts`         | An unknown project id answers 404                                                                             |                 |
| `DEV-GAL-112`   | `server.spec.ts`         | `/powered-by/charts` is served `noindex`; `/powered-by` is not                                                |                 |
| `DEV-GAL-113`   | `server.spec.ts`         | The gallery reads `/api/powered-by` from the same origin                                                      |                 |

## Changes from the original suite

- The gallery's header became the portal header (PLAN §2.14 item 5). Its tests now measure the gallery bar that holds "Submit a project" and "Donate"; the old header's mobile menu is gone (the portal header's menu is DEV-HDR's), so DEV-GAL-071 and DEV-GAL-096 no longer open it.
- `screenshots.spec.ts` wrote files only with `SCREENSHOTS=1`. DEV-GAL-090 to 101 always run: they reach each screen, check it, and attach the screenshot to the report.
- Paths are under `/powered-by`; the "unknown route" test also checks the server's 404.
