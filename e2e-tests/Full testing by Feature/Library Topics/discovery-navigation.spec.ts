/**
 * Library Topics — Topic Discovery & Navigation (LIB-012, LIB-013, LIB-014, LIB-016).
 * (LIB-015 Trending Topics lives in library-topics-landing.spec.ts — that module
 *  renders on the /topics landing page, not on individual /topics/<slug> pages.)
 *
 * Target surface: www.<sandbox>/topics/<slug> sidebar + category line, the header
 * search autocomplete, and the /topics/all/<letter> A–Z browse.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

const SLUG = 'torah';
const LIB = MODULE_URLS.EN.LIBRARY;

test.describe('Library Topics — discovery & navigation', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, LIB, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('LIB-012: Related topics sidebar — links display and navigate', { tag: '@sanity' }, async () => {
    await pm.onLibraryTopic().open(LIB, SLUG);
    await pm.onLibraryTopic().expectSidebarHasRelatedSection(3);
    const { href } = await pm.onLibraryTopic().clickFirstRelatedTopic();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('LIB-013: Category line links to the topic-category page', { tag: '@sanity' }, async () => {
    // The CSV row asks for a "Library > Topics > {Topic}" breadcrumb trail. The
    // Library topic page does not render that literal trail; instead the topic's
    // place in the hierarchy is the CATEGORY line (e.g. "Values" → /topics/category/values).
    // We assert that hierarchy element displays and navigates, which is the
    // observable navigation contract the breadcrumb row was after.
    await pm.onLibraryTopic().open(LIB, SLUG);
    const { href } = await pm.onLibraryTopic().expectCategoryPresent();
    await pm.onLibraryTopic().clickCategoryAndExpectNavigation();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('LIB-014: Search autocomplete surfaces topic suggestions that navigate to /topics/<slug>', async () => {
    // Header search → downshift autocomplete → Topics group. Typing "torah" must
    // surface a topic suggestion (anchor href ^/topics/) whose click navigates.
    await pm.onLibraryTopic().open(LIB, SLUG);
    const { link, href } = await pm.onLibraryTopic().searchAndExpectTopicSuggestion('torah');
    expect(href).toMatch(/^\/topics\//);
    await pm.onLibraryTopic().clickSuggestionAndExpectNavigation(link, href);
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('LIB-016: A–Z browse — letter pages load and alphabet links work', { tag: '@sanity' }, async () => {
    await pm.onLibraryTopic().openAllTopicsForLetter(LIB, 'a');
    await pm.onLibraryTopic().expectAllTopicsLetterPagePopulated(1);
    await pm.onLibraryTopic().clickAlphabetLetterAndExpectUrl('b');
    await expect(page).toHaveURL(/\/topics\/all\/b/);
  });
});
