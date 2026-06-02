/**
 * SEARCH FILTER SANITY TESTS
 *
 * Regression coverage for sc-44603: applying a path (category/book) filter on a
 * text search must return results.
 *
 * The bug: the search page sends text filters with filter_fields=[null] (it relies
 * on the backend supplying the default "path" field). make_filter() did not honor
 * that None default, so it fell through to Term(**{None: ...}) and raised
 * TypeError -> HTTP 500 on /api/search-wrapper. Filtered text searches returned
 * nothing. This broke both the URL-applied filter path and the in-app click path.
 *
 * PRIORITY: Critical - Run before every release
 */

import { test, expect } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { MODULE_URLS } from '../constants';

test.describe('Search Filter Sanity Tests', () => {

  // =================================================================
  // TEST 1: URL-applied path filter returns results (exact sc-44603 repro)
  // =================================================================
  test('Library - URL-applied path filter on text search returns results', async ({ context }) => {
    // The exact problematic URL from the bug report: query "מעל" filtered to Psalms.
    const query = 'מעל';
    const url = `${MODULE_URLS.EN.LIBRARY}/search?q=${encodeURIComponent(query)}`
      + `&tab=text&tpathFilters=${encodeURIComponent('Tanakh/Writings/Psalms')}`
      + `&tvar=1&tsort=relevance`;

    const page = await goToPageWithLang(context, url, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);

    // The result count only renders text when there are > 0 results (was empty / 500 before).
    const resultCount = page.locator('.searchResultCount');
    await expect(resultCount).toContainText(/\d/, { timeout: t(20000) });

    // Actual result rows render (the filtered query returns hits).
    const results = page.locator('.result.textResult');
    await expect(results.first()).toBeVisible({ timeout: t(20000) });

    // The filter sidebar only renders when totalResults > 0, so its presence
    // is an extra guarantee the filtered search succeeded.
    await expect(page.locator('.searchFilters').first()).toBeVisible({ timeout: t(20000) });
  });

  // =================================================================
  // TEST 2: Applying a path filter via the UI returns results (click path)
  // =================================================================
  test('Library - Clicking a category filter keeps results (no 500)', async ({ context }) => {
    const page = await goToPageWithLang(
      context,
      `${MODULE_URLS.EN.LIBRARY}/search?q=shabbat&tab=text&tsort=relevance`,
      LANGUAGES.EN
    );
    await hideAllModalsAndPopups(page);

    // Unfiltered search has results and the filter sidebar is shown.
    await expect(page.locator('.result.textResult').first()).toBeVisible({ timeout: t(20000) });

    // The checkbox input is visually hidden (custom styled control); the clickable
    // element is the label. Top-level categories are expandable, so the title span
    // expands the tree — the label is what toggles selection.
    const tanakhFilterLabel = page.locator('label#label-for-Tanakh').first();
    await expect(tanakhFilterLabel).toBeVisible({ timeout: t(20000) });

    // Apply the Tanakh category filter.
    await tanakhFilterLabel.click();

    // The applied filter is reflected in the URL...
    await expect(page).toHaveURL(/tpathFilters=Tanakh/, { timeout: t(20000) });

    // ...and results are still returned (before the fix this 500'd / returned 0).
    await expect(page.locator('.searchResultCount')).toContainText(/\d/, { timeout: t(20000) });
    await expect(page.locator('.result.textResult').first()).toBeVisible({ timeout: t(20000) });
  });
});

/**
 * TEST SUMMARY:
 *
 * 2 search-filter regression tests (sc-44603):
 *  1. URL-applied path filter: loads the exact reported URL (q=מעל filtered to
 *     Tanakh/Writings/Psalms) and asserts results render.
 *  2. UI click path: searches, clicks the Tanakh category filter, and asserts the
 *     filter is applied (URL) and results still render.
 *
 * Both exercise text path filters, which send filter_fields=[null] to
 * /api/search-wrapper and previously crashed the backend with a 500.
 */
