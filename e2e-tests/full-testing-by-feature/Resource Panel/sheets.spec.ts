import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Sheets (RP-100, RP-101).
 *
 * Sheets is unusual in the panel — it isn't a panel mode at all. The
 * `data-name="Sheets"` ToolsButton's onClick handler is `createSheetsWithRefURL`
 * (ConnectionsPanel.jsx:658):
 *
 *   const sheetsURL = Sefaria.getModuleURL(Sefaria.VOICES_MODULE);
 *   const normalizedRef = Sefaria.normRef(srefs);
 *   window.open(`${sheetsURL.origin}/sheets-with-ref/${normalizedRef}`, '_blank');
 *
 * So clicking Sheets opens a Voices URL in a new tab (not a panel mode
 * change). The button only renders when the segment has sheets (count > 0).
 *
 * Reference text: `Ezra.2.29` — confirmed 6 sheets via the /api/related API.
 */
test.describe('Resource Panel — Sheets — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Ezra.2.29`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickFirstSegmentToOpen();
  });

  test('RP-100: Sheets button is visible with a count badge in Resources', async () => {
    const btn = pm.onResourcePanel().toolsButton('Sheets');
    await expect(btn).toBeVisible({ timeout: t(10000) });
    const countText = await pm.onResourcePanel().getSheetsCountText();
    expect(countText).toMatch(/^\(\d+\)/); // e.g. "(6)"
  });

  test('RP-101: Clicking Sheets opens /sheets-with-ref/<ref> in a new tab', async () => {
    const newPage = await pm.onResourcePanel().clickSheetsAndCaptureNewPage();
    // The URL pattern is `${VOICES_MODULE.origin}/sheets-with-ref/<normRef>`.
    // We assert the path component (which is what `createSheetsWithRefURL`
    // controls) rather than the origin (which depends on env config).
    await expect(newPage).toHaveURL(/\/sheets-with-ref\//, { timeout: t(20000) });
    await newPage.close();
  });
});
