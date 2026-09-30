/**
 * Voices Topics — landing page (`voices.<sandbox>/topics`).
 *
 * The CSV's TOV-015 ("Topics sidebar shows trending topics") targets the
 * Trending Topics sidebar module. On Voices that module is only attached on
 * the `/topics` landing page (TopicsPage.jsx, Voices branch — sidebarModules
 * `[TrendingTopics, JoinTheConversation]`). It is NOT rendered on individual
 * `/topics/<slug>` pages (whose sidebar is `TopicSideColumn` → Related Topics).
 *
 * Keeping TOV-015 here preserves the CSV's intent (Trending Topics is what's
 * asserted) instead of retargeting it to a different surface.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

test.describe('Voices Topics landing — Trending Topics sidebar', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('TOV-015: Trending Topics sidebar lists 5–15 topics, each navigable', async () => {
    await pm.onVoicesTopic().openLandingPage(MODULE_URLS.EN.VOICES);
    await pm.onVoicesTopic().expectTrendingTopicsList(5, 15);
    const { href } = await pm.onVoicesTopic().clickFirstTrendingTopic();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
