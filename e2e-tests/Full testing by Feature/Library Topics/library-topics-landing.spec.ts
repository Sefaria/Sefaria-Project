/**
 * Library Topics — landing page (www.<sandbox>/topics).
 *
 * LIB-015 ("Topics sidebar shows trending topics") targets the Trending Topics
 * sidebar module. On the Library module that module is attached on the /topics
 * landing page (and topic-category pages), NOT on individual /topics/<slug> pages
 * (whose sidebar is TopicSideColumn → Related Topics). Keeping LIB-015 here
 * preserves the CSV's intent — same decision as the Voices Topics suite (TOV-015).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const LIB = MODULE_URLS.EN.LIBRARY;

test.describe('Library Topics landing — Trending Topics sidebar', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('LIB-015: Trending Topics sidebar lists topics, each navigable', async () => {
    await pm.onLibraryTopic().openLandingPage(LIB);
    await pm.onLibraryTopic().expectTrendingTopicsList(3, 20);
    const { href } = await pm.onLibraryTopic().clickFirstTrendingTopic();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
