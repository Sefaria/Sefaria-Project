import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Topics (RP-080, RP-081).
 *
 * Mode anchor: `.topicList`. Reached from Resources by clicking
 * `data-name="Topics"`. Topic rows render as `<a class="topicButton"
 * target="_blank" href="/topics/<slug>">` (ConnectionsPanel.jsx:879).
 *
 * Reference text: `Genesis.1` — segment 1:1 has 7 topics on production
 * (verified via the Topics button count badge).
 */
test.describe('Resource Panel — Topics — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
    await pm.onResourcePanel().toolsButton('Topics').click();
    await pm.onResourcePanel().expectMode('Topics');
  });

  test('RP-080: Topics panel shows a list of topics with titles', async () => {
    const count = await pm.onResourcePanel().countTopicButtons();
    expect(count).toBeGreaterThan(0);
    // Each topic has an inner `.topicButtonTitle` with EN/HE spans.
    await expect(
      page.locator('.connectionsPanel .topicList .topicButton .topicButtonTitle').first(),
    ).toBeVisible({ timeout: t(10000) });
  });

  test('RP-081: Clicking a topic opens its page in a new tab', async () => {
    const href = await pm.onResourcePanel().getFirstTopicHref();
    const target = await pm.onResourcePanel().getFirstTopicTarget();
    expect(href).toMatch(/\/topics\//);
    expect(target).toBe('_blank');
    const newPage = await pm.onResourcePanel().clickFirstTopicAndCaptureNewPage();
    // The new-tab navigation can queue under high concurrency on the
    // production sandbox. 30s absorbs the slow case without bloating the
    // happy-path test budget.
    await expect(newPage).toHaveURL(/\/topics\//, { timeout: t(30000) });
    await newPage.close();
  });
});
