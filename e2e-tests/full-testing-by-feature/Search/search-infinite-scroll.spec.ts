/**
 * SEARCH — infinite scroll on the entity tabs (SRCH-040 → SRCH-042)
 *
 * Covers static/js/InfiniteScroll.jsx as wired up by `EntitySearchResults` /
 * `loadNextEntityPage` in static/js/SearchPage.jsx:284.
 *
 * HOW PAGING WORKS
 * The client sends `start` = however many hits it already holds
 * (`entitySearch(query, type, cur.hits.length)`), and the response carries the
 * FULL match count as `total`. `makeEntityEntry` (SearchPage.jsx:276) appends the
 * new page and recomputes `moreToLoad` as `hits.length < min(total, 10000)`.
 *
 * The mock serves 25 topics in pages of 20, so the tab loads 20 → scrolls →
 * loads the final 5 → stops. Asserting on the captured `start` values is what
 * makes "did it page correctly?" observable rather than inferred.
 *
 * DESKTOP-only, same as the sort spec: these run under `chrome-search` /
 * `firefox-search` / `safari-search`.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups, installEntitySearchMock } from '../../utils';
import type { EntitySearchMock } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { librarySearchUrl } from '../../constants';
import { makeTopicHits } from '../../fixtures/entitySearchFixtures';

const PAGE_SIZE = 20;
const TOTAL_TOPICS = 25;
const PAGED_TOPICS = makeTopicHits(TOTAL_TOPICS);

/**
 * Simulated latency on every mocked response. Widens the in-flight window so a
 * broken duplicate-fetch guard (SRCH-042) has room to misbehave. Not wrapped in
 * `t()` — this models network latency inside the mock, it is not a wait for
 * page state.
 */
const MOCK_LATENCY_MS = 400;

test.describe('Search — infinite scroll on entity tabs — English', () => {
  let page: Page;
  let pm: PageManager;
  let mock: EntitySearchMock;

  test.beforeEach(async ({ context }) => {
    mock = await installEntitySearchMock(
      context,
      // Authors and Books stay empty: only the Topics tab is under test here, and
      // an empty list still exercises their initial fetch without adding cards.
      { topic: PAGED_TOPICS, author: [], book: [] },
      { pageSize: PAGE_SIZE, delayMs: MOCK_LATENCY_MS },
    );

    page = await goToPageWithLang(context, librarySearchUrl('shabbat'), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);

    await pm.onSearchPage().selectTab('topics');
    await pm.onSearchPage().waitForResultCards(PAGE_SIZE);
  });

  test('SRCH-040: scrolling to the bottom appends the next page of results', async () => {
    // First page only, and exactly one request so far.
    expect(mock.requestsFor('topic').map(r => r.start)).toEqual([0]);

    await pm.onSearchPage().scrollResultsToBottom();

    await pm.onSearchPage().waitForResultCards(TOTAL_TOPICS);
    // The follow-up asked for offset 20 — i.e. it appended rather than refetching
    // page 1 and replacing the list.
    await expect.poll(() => mock.requestsFor('topic').map(r => r.start), { timeout: t(15000) })
      .toEqual([0, PAGE_SIZE]);
  });

  test('SRCH-041: no further requests are made once every hit is loaded', async () => {
    await pm.onSearchPage().scrollResultsToBottom();
    await pm.onSearchPage().waitForResultCards(TOTAL_TOPICS);
    await expect.poll(() => mock.requestsFor('topic').length, { timeout: t(15000) }).toBe(2);

    // The list is now exhausted (hits.length === total → moreToLoad false).
    await pm.onSearchPage().scrollResultsToBottom(3);

    // Proving a negative needs a settle window; this is the "deliberate pacing"
    // exception to the no-waitForTimeout rule, wrapped in t() as required.
    await page.waitForTimeout(t(1500));

    expect(mock.requestsFor('topic')).toHaveLength(2);
    expect(await pm.onSearchPage().resultCardCount()).toBe(TOTAL_TOPICS);
  });

  test('SRCH-042: rapid repeated scrolls fetch each page only once', async () => {
    // Five scroll events dispatched back-to-back in a single JS turn. React state
    // (`isLoadingMore`) has not flushed yet at that point, so only the synchronous
    // `pending` ref inside InfiniteScroll can suppress the duplicates — which is
    // precisely the guard under test.
    await pm.onSearchPage().scrollResultsToBottom(5);

    await pm.onSearchPage().waitForResultCards(TOTAL_TOPICS);
    await page.waitForTimeout(t(1500)); // let any stray duplicate land before counting

    // A broken guard shows up as [0, 20, 20, 20, ...].
    expect(mock.requestsFor('topic').map(r => r.start)).toEqual([0, PAGE_SIZE]);
    expect(await pm.onSearchPage().resultCardCount()).toBe(TOTAL_TOPICS);
  });
});

/**
 * TEST SUMMARY:
 *
 * SRCH-040. Scroll appends page 2 at the correct offset (append, not replace)
 * SRCH-041. Requests stop once hits.length reaches total; card count holds steady
 * SRCH-042. Five synchronous scroll events still produce exactly one page-2 fetch
 *
 * NOT COVERED HERE: the 10,000-result ceiling in `makeEntityEntry`
 * (`Math.min(data.total, 10000)`), which stops paging before Elasticsearch would
 * reject the offset. Reaching it needs a 10k-hit fixture; the cheaper check is
 * the "10,000+" tab badge, which belongs with the tab tests.
 */
