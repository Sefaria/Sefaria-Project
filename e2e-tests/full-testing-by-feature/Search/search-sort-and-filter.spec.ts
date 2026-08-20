/**
 * SEARCH — sort & category filter on the entity tabs (SRCH-030 → SRCH-039)
 *
 * Covers the Books / Authors / Topics tabs of the rewritten search page
 * (static/js/SearchPage.jsx), specifically the sort dropdown
 * (static/js/SearchSortDropdown.jsx) and the Books category sidebar
 * (`BookSearchFilters` in static/js/SearchFilters.jsx).
 *
 * WHY THESE TESTS MOCK THE API
 * Sorting and category filtering are the SERVER's job — they apply to the whole
 * match set, not to the page the browser happens to hold. The page sends `sort`
 * and repeated `filter` params (`entitySearch` in static/js/sefaria/search.js),
 * discards its accumulated pages, and refetches from offset 0. Serving
 * `/api/entity-search` from fixtures lets `installEntitySearchMock` reproduce the
 * backend's ordering rules exactly, so these tests assert EXACT orderings instead
 * of "assert something changed" — see fixtures/entitySearchFixtures.ts.
 *
 * SRCH-037 → SRCH-039 are the regression guards for the client-side-only version
 * of this feature: params actually leaving the browser, the refetch starting over
 * at offset 0, and the sidebar's counts staying whole-match-set numbers.
 *
 * These are DESKTOP-only tests. The sort dropdown renders only when
 * `Sefaria.multiPanel` is true, which is decided server-side from the
 * User-Agent (reader/views.py:344); the mobile config gets a filter drawer
 * instead. Run under `chrome-search` / `firefox-search` / `safari-search`.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups, installEntitySearchMock } from '../../utils';
import type { EntitySearchMock } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { librarySearchUrl } from '../../constants';
import {
  AUTHOR_HITS,
  AUTHORS_BY_RELEVANCE,
  AUTHORS_BY_ALPHA,
  AUTHORS_BY_YEAR_ASC,
  AUTHORS_BY_YEAR_DESC,
  BOOK_HITS,
  BOOK_CATEGORY_COUNTS,
  BOOKS_BY_RELEVANCE,
  BOOKS_BY_YEAR_ASC,
  BOOKS_BY_YEAR_DESC,
  BOOKS_IN_TANAKH,
  BOOKS_IN_TANAKH_OR_HALAKHAH,
  TOPIC_HITS,
  TOPICS_BY_RELEVANCE,
  SORT_OPTION_NAMES,
} from '../../fixtures/entitySearchFixtures';

/** The author with no birth/death year — must sort last in BOTH directions. */
const UNDATED_AUTHOR = 'Zechariah ben Avkulas';

test.describe('Search — sort & filter on entity tabs — English', () => {
  let page: Page;
  let pm: PageManager;
  let mock: EntitySearchMock;

  test.beforeEach(async ({ context }) => {
    // Routed on the context so the mock is live before the page is created and
    // navigated — same reason installOverlaySuppression routes at context level.
    mock = await installEntitySearchMock(context, {
      topic: TOPIC_HITS,
      author: AUTHOR_HITS,
      book: BOOK_HITS,
    });

    page = await goToPageWithLang(context, librarySearchUrl('shabbat'), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  // =================================================================
  // Sort menu contents
  // =================================================================

  test('SRCH-030: Books tab offers relevance, both composition-date directions, and A-Z', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForResultCards(BOOK_HITS.length);

    expect(await pm.onSearchPage().sortOptionNames()).toEqual([...SORT_OPTION_NAMES.books]);
  });

  test('SRCH-031: Topics tab offers only relevance and A-Z — topics carry no year data', async () => {
    await pm.onSearchPage().selectTab('topics');
    await pm.onSearchPage().waitForResultCards(TOPIC_HITS.length);

    // Baseline: Relevance is the API's own scored ordering, rendered untouched.
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(TOPICS_BY_RELEVANCE);

    const options = await pm.onSearchPage().sortOptionNames();
    expect(options).toEqual([...SORT_OPTION_NAMES.topics]);
    // Explicit negative: topics carry no year, and ENTITY_SORTS rejects a year sort
    // on them outright (the API 400s), so the menu must not offer one.
    expect(options.filter(o => /year|date/i.test(o))).toEqual([]);
  });

  // =================================================================
  // Authors — alphabetical and chronological
  // =================================================================

  test('SRCH-032: Authors A-Z reorders the results alphabetically', async () => {
    await pm.onSearchPage().selectTab('authors');
    await pm.onSearchPage().waitForResultCards(AUTHOR_HITS.length);

    // Baseline: the default Relevance sort leaves API order untouched.
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(AUTHORS_BY_RELEVANCE);

    await pm.onSearchPage().setSort('A-Z');

    expect(await pm.onSearchPage().currentSortLabel()).toBe('A-Z');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(AUTHORS_BY_ALPHA);
  });

  test('SRCH-033: Authors year (oldest first) leads with the BCE author and trails with the undated one', async () => {
    await pm.onSearchPage().selectTab('authors');
    await pm.onSearchPage().waitForResultCards(AUTHOR_HITS.length);

    await pm.onSearchPage().setSort('Year (Oldest First)');

    // Hillel the Elder (d. 10 BCE) must lead — a naive comparator that ignores
    // negative years would bury him among the medieval authors.
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(AUTHORS_BY_YEAR_ASC);
  });

  test('SRCH-034: Authors year (newest first) reverses the order but keeps the undated author last', async () => {
    await pm.onSearchPage().selectTab('authors');
    await pm.onSearchPage().waitForResultCards(AUTHOR_HITS.length);

    await pm.onSearchPage().setSort('Year (Newest First)');

    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(AUTHORS_BY_YEAR_DESC);

    // The regression this guards: undated hits go to the end regardless of
    // direction (`missing: "_last"` on both year sort clauses). Treating a missing
    // year as 0 would float this author to the top of a descending sort.
    const names = await pm.onSearchPage().resultCardNames();
    expect(names[names.length - 1]).toBe(UNDATED_AUTHOR);
  });

  // =================================================================
  // Books — composition date and category filter
  // =================================================================

  test('SRCH-035: Books composition-date sort orders correctly in both directions', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForResultCards(BOOK_HITS.length);

    await pm.onSearchPage().setSort('Composition Date (Oldest First)');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(BOOKS_BY_YEAR_ASC);

    await pm.onSearchPage().setSort('Composition Date (Newest First)');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(BOOKS_BY_YEAR_DESC);
  });

  test('SRCH-036: Books category filter narrows results, ORs multiple categories, and clears', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForResultCards(BOOK_HITS.length);

    // One category. `Rashi on Genesis` is filed ['Tanakh', 'Commentary'] and still
    // counts — a filter matches its path and everything nested under it.
    await pm.onSearchPage().toggleBookCategoryFilter('Tanakh');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(BOOKS_IN_TANAKH);

    // Two categories OR together rather than intersecting.
    await pm.onSearchPage().toggleBookCategoryFilter('Halakhah');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(BOOKS_IN_TANAKH_OR_HALAKHAH);

    // Unchecking both restores the full, unfiltered set.
    await pm.onSearchPage().toggleBookCategoryFilter('Tanakh');
    await pm.onSearchPage().toggleBookCategoryFilter('Halakhah');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(BOOKS_BY_RELEVANCE);
  });

  // =================================================================
  // The params actually reach the server (regression guards)
  // =================================================================

  test('SRCH-037: changing the sort refetches from offset 0 with the new sort param', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForResultCards(BOOK_HITS.length);

    // The initial fetch: default sort, no filters.
    const initial = mock.requestsFor('book');
    expect(initial).toHaveLength(1);
    expect(initial[0].sort).toBe('relevance');
    expect(initial[0].filters).toEqual([]);

    await pm.onSearchPage().setSort('Composition Date (Newest First)');

    // A second request carrying the new sort — NOT a silent reordering of the rows
    // already downloaded, which could never surface a result from a later page.
    await expect.poll(() => mock.requestsFor('book').length, { timeout: t(10000) }).toBe(2);
    const refetch = mock.requestsFor('book')[1];
    expect(refetch.sort).toBe('year_desc');
    // Back to the first page: the new ordering applies to the whole match set, so the
    // pages already held are meaningless and must not be appended to.
    expect(refetch.start).toBe(0);
  });

  test('SRCH-038: selecting a category refetches from offset 0 with a filter param', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForResultCards(BOOK_HITS.length);

    await pm.onSearchPage().toggleBookCategoryFilter('Tanakh');
    await expect.poll(() => mock.requestsFor('book').length, { timeout: t(10000) }).toBe(2);

    const filtered = mock.requestsFor('book')[1];
    expect(filtered.filters).toEqual(['Tanakh']);
    expect(filtered.start).toBe(0);

    // Adding a second category sends both, still from the top of the result set.
    await pm.onSearchPage().toggleBookCategoryFilter('Halakhah');
    await expect.poll(() => mock.requestsFor('book').length, { timeout: t(10000) }).toBe(3);

    const both = mock.requestsFor('book')[2];
    expect([...both.filters].sort()).toEqual(['Halakhah', 'Tanakh']);
    expect(both.start).toBe(0);
  });

  test('SRCH-039: sidebar category counts are whole-match-set numbers and survive filtering', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForResultCards(BOOK_HITS.length);

    // Every category with at least one match is listed, with its true count.
    await expect.poll(() => pm.onSearchPage().bookCategoryCounts(), { timeout: t(10000) })
      .toEqual(BOOK_CATEGORY_COUNTS);

    await pm.onSearchPage().toggleBookCategoryFilter('Tanakh');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(BOOKS_IN_TANAKH);

    // The whole point of counting server-side: a filtered response contains only
    // Tanakh books, so counts derived from the rows on screen would zero out every
    // other category, hide it, and leave no way to switch categories.
    expect(await pm.onSearchPage().bookCategoryCounts()).toEqual(BOOK_CATEGORY_COUNTS);
    await pm.onSearchPage().toggleBookCategoryFilter('Halakhah');
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(BOOKS_IN_TANAKH_OR_HALAKHAH);
  });
});

/**
 * TEST SUMMARY:
 *
 * SRCH-030. Books sort menu — all four options, in order
 * SRCH-031. Topics sort menu — relevance + A-Z only, no year options
 * SRCH-032. Authors A-Z — alphabetical reorder (baseline relevance asserted first)
 * SRCH-033. Authors year ascending — BCE author leads, undated trails
 * SRCH-034. Authors year descending — reversed, undated STILL trails
 * SRCH-035. Books composition date — both directions
 * SRCH-036. Books category filter — single, multi (OR), and clear
 * SRCH-037. Sort change → refetch from start=0 with the new `sort` param
 * SRCH-038. Category select → refetch from start=0 with repeated `filter` params
 * SRCH-039. Sidebar counts span the whole match set and survive a filter
 *
 * DELIBERATE OMISSION: there is no Books A-Z test. Every entity type takes the
 * identical `alpha` path on the server, so SRCH-032 already covers it; a Books
 * variant would add runtime, not coverage.
 *
 * Relevance is the API's own scored ordering, rendered as received, so
 * TOPICS_BY_RELEVANCE / BOOKS_BY_RELEVANCE double as assertions that the page
 * does not reorder what it is given.
 */
