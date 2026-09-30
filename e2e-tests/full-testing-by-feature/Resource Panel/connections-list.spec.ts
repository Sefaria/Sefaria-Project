import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Connections List (RP-060 → RP-063).
 *
 * Mode anchor: `.categoryFilterGroup, .category, .textFilter`. Reached from
 * Resources by clicking any `.categoryFilter[data-name="<Category>"]`.
 *
 * Source: `static/js/ConnectionFilters.jsx` — `CategoryFilter` and
 * `TextFilter` components. `TextFilter` renders `<a><div data-name={book}
 * class="textFilter">…<span class="connectionsCount">(N)</span>…
 * <EnglishAvailableTag /></div></a>` and `EnglishAvailableTag` renders
 * `<span class="englishAvailableTag">EN</span>` only when
 * `hasEnglish && TORAH_SPECIFIC` (line 65).
 *
 * Reference text: `Genesis.1` — 1607 commentary connections on 1:1; reliably
 * exercises all four CSV rows.
 */
test.describe('Resource Panel — Connections List — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
  });

  test('RP-060: Clicking a category opens ConnectionsList with books and counts', async () => {
    await pm.onResourcePanel().openCategoryConnections('Commentary');
    // Every TextFilter should expose its book name via data-name.
    const books = await pm.onResourcePanel().getBookFilterNames();
    expect(books.length).toBeGreaterThan(5); // Genesis 1:1 Commentary has many books.
    // At least one book carries a numeric connections count, e.g. "(5)".
    const firstBookCount = await pm.onResourcePanel().getBookFilterCount(books[0]);
    expect(firstBookCount).toMatch(/^\(\d+\)/);
    // Back button is visible (we're inside a sub-mode).
    await pm.onResourcePanel().expectBackButtonVisible();
  });

  test('RP-061: Clicking a book enters TextList for that book', { tag: '@sanity' }, async () => {
    await pm.onResourcePanel().openCategoryConnections('Commentary');
    // Pick the first available book (whatever Sefaria has — stable enough).
    const books = await pm.onResourcePanel().getBookFilterNames();
    expect(books.length).toBeGreaterThan(0);
    await pm.onResourcePanel().openTextListForBook(books[0]);
    await pm.onResourcePanel().expectTextListHasSnippets();
    // Back from TextList should return to ConnectionsList (back link visible).
    await pm.onResourcePanel().expectBackButtonVisible();
  });

  test('RP-062: Recent filters appear in the TextList view after multiple navigations', async () => {
    // RecentFilterSet renders inside the TextList view itself
    // (TextList.jsx:188). After visiting Rashi then Ibn Ezra, the TextList
    // for the second book shows both the active filter chip ("Ibn Ezra")
    // *and* the prior one ("Rashi") inside `.connectionsPanel .recentFilterSet`.
    // Verified via DOM probe.
    await pm.onResourcePanel().openCategoryConnections('Commentary');
    const books = await pm.onResourcePanel().getBookFilterNames();
    expect(books.length).toBeGreaterThanOrEqual(2);
    await pm.onResourcePanel().openTextListForBook(books[0]);
    await pm.onResourcePanel().clickBack();
    await pm.onResourcePanel().openTextListForBook(books[1]);
    await page.waitForTimeout(t(2500));
    // While in TextList, the panel shows at least 2 recent-filter chips
    // (the currently active one + previously visited).
    const chipCount = await page.locator(
      '.connectionsPanel .recentFilterSet .textFilter',
    ).count();
    expect(chipCount).toBeGreaterThanOrEqual(2);
  });

  test('RP-063: Books with English translations carry the "EN" availability tag', async () => {
    await pm.onResourcePanel().openCategoryConnections('Commentary');
    // `EnglishAvailableTag` is rendered for every book that has
    // `hasEnglish && Sefaria._siteSettings.TORAH_SPECIFIC`. Genesis is the
    // canonical Torah text — many commentaries on Genesis have English
    // translations on production. We assert that at least one EN tag is
    // present, proving the rendering path is reached.
    const tagCount = await pm.onResourcePanel().countBookFiltersWithEnglishTag();
    expect(tagCount).toBeGreaterThan(0);
  });
});
