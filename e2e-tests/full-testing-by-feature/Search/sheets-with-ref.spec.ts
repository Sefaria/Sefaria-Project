/**
 * SEARCH — "Sheets With <ref>" regression smoke (SRCH-050)
 *
 * WHY THIS EXISTS
 * `SheetsWithRefPage.jsx` used to render by delegating to `SearchPage`. The
 * search-results rewrite forked that layout into a local `SheetsWithRefLayout`
 * component — a deliberate copy, so search UX changes stop restyling this page.
 * A fork is exactly the kind of change that can break silently: nothing else in
 * the suite renders this page. `Resource Panel/sheets.spec.ts` (RP-101) only
 * asserts that clicking the Sheets button *opens* `/sheets-with-ref/<ref>`; it
 * closes the tab without looking at what loaded.
 *
 * SCOPE
 * Deliberately minimal — does the page still mount and render sheet results?
 * Sort-box and filter-sidebar behavior on this page is not covered here; the
 * entity-tab specs cover those controls on the search page proper.
 *
 * REFERENCE TEXT
 * `Ezra.2.29` — the same ref RP-100/RP-101 use, verified via
 * `GET /api/related/Ezra.2.29` to carry sheets (5 on production at time of
 * writing). The assertion is `>= 1`, not an exact count, since sheet counts
 * drift as users publish.
 *
 * This page is served by Voices, so the spec navigates to an absolute
 * `MODULE_URLS.EN.VOICES` URL — the `chrome-search` project's Library baseURL
 * is incidental (see this folder's README).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { sheetsWithRefUrl } from '../../constants';

const REF_WITH_SHEETS = 'Ezra.2.29';

test.describe('Search — Sheets With ref page — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, sheetsWithRefUrl(REF_WITH_SHEETS), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('SRCH-050: the Sheets With page renders sheet results after the layout fork', async () => {
    await pm.onSearchPage().waitForSheetResults();
    expect(await pm.onSearchPage().sheetResultCount()).toBeGreaterThanOrEqual(1);
  });
});

/**
 * TEST SUMMARY:
 *
 * SRCH-050. /sheets-with-ref/<ref> mounts and renders at least one sheet result.
 *
 * NOT COVERED HERE: the sort box, the filter sidebar, the AI-ranking badge, and
 * the result count in the top line — all present in `SheetsWithRefLayout` and
 * all worth their own tests if this page grows a dedicated suite.
 */
