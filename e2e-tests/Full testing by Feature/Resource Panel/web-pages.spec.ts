import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Web Pages (RP-090 → RP-092).
 *
 * Mode anchor: `.webpageList`. Reached from Resources by clicking
 * `data-name="Web Pages"`. Reference text: `Ezra.2.29` — CSV-specified as
 * having known web pages. Each site renders as
 *   `<div class="website" role="button" tabindex="0">`
 *     `<img class="icon" src=faviconUrl />`
 *     `<span class="siteName">{name} <span class="connectionsCount">(N)</span></span>`
 *   `</div>`
 * (ConnectionsPanel.jsx:993). Clicking a site calls `setFilter(site.name)`,
 * filtering to that site's individual pages.
 */
test.describe('Resource Panel — Web Pages — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Ezra.2.29`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickFirstSegmentToOpen();
    await pm.onResourcePanel().toolsButton('Web Pages').click();
    await pm.onResourcePanel().expectMode('WebPages');
  });

  test('RP-090: Sites listed with favicon, site name, and connection count', async () => {
    await pm.onResourcePanel().expectWebsitesListed();
    const count = await pm.onResourcePanel().countWebsites();
    expect(count).toBeGreaterThan(0);
    // First site should have an icon, a siteName, and a count badge.
    const first = page.locator('.connectionsPanel .website[role="button"]').first();
    await expect(first.locator('img.icon').first()).toBeVisible({ timeout: t(10000) });
    await expect(first.locator('.siteName').first()).toBeVisible({ timeout: t(10000) });
    await expect(first.locator('.siteName .connectionsCount').first()).toBeVisible({ timeout: t(10000) });
  });

  test('RP-091: Clicking a site filters to that site\'s individual pages', async () => {
    const siteName = await pm.onResourcePanel().openFirstSite();
    expect(siteName).toBeTruthy();
    await pm.onResourcePanel().expectWebPagesAfterSiteFilter();
    // Back button is visible since we drilled into a filter.
    await pm.onResourcePanel().expectBackButtonVisible();
  });

  test('RP-092: Clicking a specific page opens it in a new tab', async () => {
    await pm.onResourcePanel().openFirstSite();
    await pm.onResourcePanel().expectWebPagesAfterSiteFilter();
    const newPage = await pm.onResourcePanel().clickFirstWebPageAndCaptureNewPage();
    // The new tab navigates to the external site — we just confirm the page
    // loads (any URL outside Sefaria's domain counts as success).
    expect(newPage.url()).toBeTruthy();
    expect(newPage.url()).not.toBe('about:blank');
    await newPage.close();
  });
});
