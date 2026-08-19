/**
 * SEARCH — NoSearchResults null state (SRCH-060 → SRCH-065)
 *
 * Tests the NoSearchResults component (static/js/NoSearchResults.jsx), which
 * renders in place of a results list when a search returns 0 hits. The component
 * has four modes — sources, books, authors, topics — each with its own heading,
 * body copy, and CTA destination.
 *
 * Rendering paths:
 *   - Books / Authors / Topics tabs: EntitySearchResults (SearchPage.jsx:182)
 *     renders NoSearchResults when `data.hits.length === 0`. These tests mock
 *     /api/entity-search to return empty arrays, making the null state
 *     deterministic regardless of what the search index contains.
 *   - Sources tab: SearchPage (SearchPage.jsx:445) renders NoSearchResults when
 *     `totalResults.getValue() === 0`. SRCH-065 uses a gibberish query against
 *     the real text-search API; the query is chosen to produce 0 results reliably.
 *
 * All entity-tab tests run with the mock installed at context level (same pattern
 * as search-sort-and-filter.spec.ts). SRCH-065 has no mock so it can exercise
 * the full sources-tab code path including the real Elasticsearch round-trip.
 *
 * Run:
 *   npx playwright test --project=chrome-search no-search-results.spec.ts
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups, installEntitySearchMock } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { librarySearchUrl } from '../../constants';

/**
 * Query used for entity-tab null-state tests. The entity mock returns empty
 * arrays regardless of the query, so the string only matters for the heading
 * interpolation assertion (SRCH-063).
 */
const ENTITY_NULL_QUERY = 'xyznosuchterm';

/**
 * Query for the sources-tab null-state test (SRCH-065). Chosen to return 0
 * results from Elasticsearch because it contains no recognizable text in any
 * language. If this ever starts matching an indexed document, replace it with
 * a longer gibberish string.
 */
const SOURCES_NULL_QUERY = 'xyzqwerty12345nosuchterm';

// =============================================================================
// Entity tabs — Books / Authors / Topics (deterministic via mock)
// =============================================================================

test.describe('Search — NoSearchResults null state — entity tabs', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    // Serve /api/entity-search with empty hits for every type. The null state
    // renders as soon as EntitySearchResults receives data === {hits:[], total:0}.
    await installEntitySearchMock(context, { topic: [], author: [], book: [] });

    page = await goToPageWithLang(context, librarySearchUrl(ENTITY_NULL_QUERY), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  // =================================================================
  // TEST SRCH-060: Books tab — null state visible, CTA → /texts
  // =================================================================
  test('SRCH-060: Books tab shows null state and links to /texts', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForNullState();

    expect(await pm.onSearchPage().nullStateCtaHref()).toBe('/texts');
  });

  // =================================================================
  // TEST SRCH-061: Authors tab — null state visible, CTA → /people
  // =================================================================
  test('SRCH-061: Authors tab shows null state and links to /people', async () => {
    await pm.onSearchPage().selectTab('authors');
    await pm.onSearchPage().waitForNullState();

    expect(await pm.onSearchPage().nullStateCtaHref()).toBe('/people');
  });

  // =================================================================
  // TEST SRCH-062: Topics tab — null state visible, CTA → /topics
  // =================================================================
  test('SRCH-062: Topics tab shows null state and links to /topics', async () => {
    await pm.onSearchPage().selectTab('topics');
    await pm.onSearchPage().waitForNullState();

    expect(await pm.onSearchPage().nullStateCtaHref()).toBe('/topics');
  });

  // =================================================================
  // TEST SRCH-063: Heading interpolates the search query
  // NoSearchResults.jsx:50 — heading = Sefaria._(h1Key).replace('[query]', query)
  // =================================================================
  test('SRCH-063: Null state heading contains the search query', async () => {
    await pm.onSearchPage().selectTab('topics');
    await pm.onSearchPage().waitForNullState();

    const heading = await pm.onSearchPage().nullStateHeadingText();
    expect(heading).toContain(ENTITY_NULL_QUERY);
  });

  // =================================================================
  // TEST SRCH-064: Caption has exactly two mailto: links (report bug, contact us)
  // NoSearchResults.jsx:33 — renderCaption splits on [report_bug] / [contact_us]
  // =================================================================
  test('SRCH-064: Null state caption has report-bug and contact-us links', async () => {
    await pm.onSearchPage().selectTab('books');
    await pm.onSearchPage().waitForNullState();

    const hrefs = await pm.onSearchPage().nullStateCaptionLinkHrefs();
    expect(hrefs).toHaveLength(2);
    expect(hrefs[0]).toMatch(/^mailto:/);
    expect(hrefs[1]).toMatch(/^mailto:/);
  });
});

// =============================================================================
// Sources tab — real Elasticsearch round-trip
// =============================================================================

test.describe('Search — NoSearchResults null state — sources tab', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    // No entity mock: the sources null state is driven by the text-search API,
    // not /api/entity-search. The garbled SOURCES_NULL_QUERY reliably yields 0
    // results from Elasticsearch. A longer timeout covers the real network call.
    page = await goToPageWithLang(context, librarySearchUrl(SOURCES_NULL_QUERY), LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  // =================================================================
  // TEST SRCH-065: Sources tab shows null state, CTA → /texts, heading
  //               interpolates the query
  // Render path: SearchPage.jsx:445 — `totalResults && !totalResults.getValue()`
  // =================================================================
  test('SRCH-065: Sources tab shows null state for a zero-result query', async () => {
    // Sources is the default active tab; null state mounts once the text search
    // completes and totalResults.getValue() === 0.
    await pm.onSearchPage().waitForNullState();

    expect(await pm.onSearchPage().nullStateCtaHref()).toBe('/texts');

    const heading = await pm.onSearchPage().nullStateHeadingText();
    expect(heading).toContain(SOURCES_NULL_QUERY);
  });
});

/**
 * TEST SUMMARY:
 *
 * SRCH-060. Books null state — CTA href is /texts
 * SRCH-061. Authors null state — CTA href is /people
 * SRCH-062. Topics null state — CTA href is /topics
 * SRCH-063. Heading interpolation — query appears in null state heading
 * SRCH-064. Caption links — exactly two mailto: hrefs (report bug, contact us)
 * SRCH-065. Sources null state — real search returns 0, CTA is /texts, heading includes query
 *
 * SRCH-060–064 use installEntitySearchMock with empty arrays for determinism.
 * SRCH-065 hits the real Elasticsearch text-search endpoint; the query is
 * deliberately gibberish to guarantee 0 hits without data coupling.
 *
 * NOT TESTED HERE:
 * - Visual regression (placeholder image, layout) — out of scope for functional E2E.
 * - Body copy exact text — driven by i18n keys, not component logic.
 * - Hebrew interface — NoSearchResults is non-interactive; localization is covered
 *   by the i18n-keyed-strings suite (Misc/i18n-keyed-strings.spec.ts).
 */
