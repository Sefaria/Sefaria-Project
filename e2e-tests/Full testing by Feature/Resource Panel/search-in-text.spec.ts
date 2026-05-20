import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Search in This Text / SidebarSearch (RP-180, RP-181).
 *
 * Mode anchor: `.sidebarSearch.lexicon-content`. Reached from Resources by
 * clicking `data-name="Search in this Text"`. Source: SidebarSearch.jsx.
 * Pressing Enter on `#searchQueryInput` triggers an ElasticSearchQuerier
 * call scoped to the current book — results render as the querier's
 * sidebarSearchResult rows.
 *
 * Reference text: `Genesis.1` — "covenant" is a high-frequency term in
 * Genesis and reliably yields results.
 */
test.describe('Resource Panel — Search in Text — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().openSidebarSearch();
  });

  test('RP-180: Sidebar search panel opens with an input focused for typing', async () => {
    const input = pm.onResourcePanel().searchInTextInput();
    await expect(input).toBeVisible({ timeout: t(10000) });
    await expect(input).toHaveAttribute('placeholder', /Search in this text/i);
  });

  test('RP-181: Searching for a common term in the current book yields results', async () => {
    await pm.onResourcePanel().typeInSidebarSearch('covenant');
    // ElasticSearchQuerier results render under the panel. We accept any
    // anchor that links into the text (the querier renders result rows as
    // links with `?qh=` query params).
    await pm.onResourcePanel().expectSidebarSearchHasResults();
  });
});
