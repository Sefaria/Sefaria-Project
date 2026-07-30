/**
 * SEARCH — sort & category filter on the entity tabs (SRCH-030 → SRCH-036)
 *
 * Covers the Books / Authors / Topics tabs of the rewritten search page
 * (static/js/SearchPage.jsx), specifically the sort dropdown
 * (static/js/SearchSortDropdown.jsx) and the Books category sidebar
 * (`BookSearchFilters` in static/js/SearchFilters.jsx).
 *
 * WHY THESE TESTS MOCK THE API
 * Sorting and category filtering are 100% client-side: `entitySearch()` never
 * sends a `sort` param (static/js/sefaria/search.js), and `getSortedEntityData`
 * sorts and filters the already-fetched hits in the browser (SearchPage.jsx:228).
 * Serving `/api/entity-search` from fixtures therefore gives EXACT expected
 * orderings instead of "assert something changed" — see
 * fixtures/entitySearchFixtures.ts.
 *
 * These are DESKTOP-only tests. The sort dropdown renders only when
 * `Sefaria.multiPanel` is true, which is decided server-side from the
 * User-Agent (reader/views.py:344); the mobile config gets a filter drawer
 * instead. Run under `chrome-search` / `firefox-search` / `safari-search`.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups, installEntitySearchMock } from '../../utils';
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

  test.beforeEach(async ({ context }) => {
    // Routed on the context so the mock is live before the page is created and
    // navigated — same reason installOverlaySuppression routes at context level.
    await installEntitySearchMock(context, {
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

    // Baseline: the default Relevance sort returns early in sortEntityHits, so
    // the API's own ordering must survive untouched.
    await expect.poll(() => pm.onSearchPage().resultCardNames(), { timeout: t(10000) })
      .toEqual(TOPICS_BY_RELEVANCE);

    const options = await pm.onSearchPage().sortOptionNames();
    expect(options).toEqual([...SORT_OPTION_NAMES.topics]);
    // Explicit negative: offering a year sort on topics would silently produce a
    // no-op sort, since `getYear` returns null for every topic hit.
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

    // The regression this guards: sortEntityHits pushes undated hits to the end
    // regardless of direction (`if (ya == null) return 1`). Treating a missing
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
    // counts — the filter matches categories[0] only (SearchPage.jsx:238).
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
 *
 * DELIBERATE OMISSION: there is no Books A-Z test. `sortEntityHits` runs the
 * identical localeCompare branch for every entity type, so SRCH-032 already
 * covers that code path; a Books variant would add runtime, not coverage.
 *
 * Relevance order is never re-sorted — `sortEntityHits` returns early for
 * 'relevance' — so TOPICS_BY_RELEVANCE / BOOKS_BY_RELEVANCE double as
 * assertions that the API's own ordering is preserved.
 */
