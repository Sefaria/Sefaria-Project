/**
 * SEARCH — feature-coverage tests (SRCH-NNN)
 *
 * Tests critical search functionality across Library and Voices modules.
 * Validates search suggestions, search results, and dropdown UI elements.
 *
 * The @sanity-tagged subset here is part of the release-gate suite
 * (see Sanity/README.md). Tests navigate to absolute MODULE_URLS, so the
 * project baseURL is incidental.
 */

import { test, expect } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS, SEARCH_DROPDOWN } from '../../constants';

test.describe('Search', { tag: '@sanity' }, () => {

  // =================================================================
  // TEST 1: LIBRARY - Search suggestion click and navigation
  // =================================================================
  test('SRCH-001: Library - Click search suggestion and arrive at destination', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);

    // Type in search to trigger suggestions
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('abraham');

    // Wait for dropdown to appear
    const dropdown = page.locator(SEARCH_DROPDOWN.CONTAINER);
    await expect(dropdown).toBeVisible({ timeout: t(10000) });

    // Click on the first topic suggestion (should be "Abraham" topic)
    const topicSuggestion = dropdown.locator('.search-suggestion').filter({ hasText: /Abraham/i }).first();
    await expect(topicSuggestion).toBeVisible({ timeout: t(10000) });
    await topicSuggestion.click();

    // Wait for navigation
    await page.waitForLoadState('domcontentloaded');

    // Verify we arrived at a topic page
    expect(page.url()).toMatch(/topic|abraham/i);
  });

  // =================================================================
  // TEST 2: LIBRARY - Submit search and verify results
  // =================================================================
  test('SRCH-002: Library - Submit search and get results', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);

    // Type search term and submit
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('avraham');
    await searchBox.press('Enter');

    // Web-first URL assertion — polls the URL and does NOT wait for the `load`
    // event, so it's robust against the search submit/navigation landing late.
    await expect(page).toHaveURL(/\/search\?q=avraham/, { timeout: t(15000) });
    await hideAllModalsAndPopups(page);

    // Verify search results are displayed
    const searchContent = page.locator('.searchContent, .content');
    await expect(searchContent.first()).toBeVisible({ timeout: t(10000) });

    // Verify we have results (check for "Results" text in result count)
    const resultsText = page.locator('text=/Results/i');
    await expect(resultsText.first()).toBeVisible({ timeout: t(10000) });
  });

  // =================================================================
  // TEST 3: LIBRARY - Search dropdown sections validation
  // =================================================================
  test('SRCH-003: Library - Search dropdown sections and icons validation', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Test search dropdown with 'mid' to trigger all sections
    await pm.onModuleHeader().testSearchDropdown(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.LIBRARY_SHOW_ALL,
      SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS,
      SEARCH_DROPDOWN.LIBRARY_EXCLUDED_SECTIONS
    );

    // Test search dropdown icons
    await pm.onModuleHeader().testSearchDropdownIcons(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.LIBRARY_SHOW_ALL,
      SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_ICONS
    );
  });

  // =================================================================
  // TEST 4: VOICES - Search suggestion click and navigation
  // =================================================================
  test('SRCH-004: Voices - Click search suggestion and arrive at destination', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Type in search to trigger suggestions
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('rashi');

    // Wait for dropdown to appear
    const dropdown = page.locator(SEARCH_DROPDOWN.CONTAINER);
    await expect(dropdown).toBeVisible({ timeout: t(5000) });

    // Click on a topic or author suggestion
    const suggestion = dropdown.locator('.search-suggestion').filter({ hasText: /Rashi/i }).first();
    await expect(suggestion).toBeVisible({ timeout: t(5000) });
    await suggestion.click();

    // Wait for navigation
    await page.waitForLoadState('domcontentloaded');

    // Verify we arrived at a topic/author page
    expect(page.url()).toMatch(/topic|profile|rashi/i);
  });

  // =================================================================
  // TEST 5: VOICES - Submit search and verify results
  // =================================================================
  test('SRCH-005: Voices - Submit search and get results', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Type search term and submit
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('shabbat');
    await searchBox.press('Enter');

    // Voices is an SPA whose `load` event can lag well past the URL update, so
    // `waitForURL` (which waits for `load` by default) flakes here. Use a
    // web-first URL assertion that polls the URL without waiting for `load`.
    await expect(page).toHaveURL(/\/search\?q=shabbat/, { timeout: t(15000) });
    await hideAllModalsAndPopups(page);

    // Verify search results are displayed
    const searchContent = page.locator('.searchContent, .content');
    await expect(searchContent.first()).toBeVisible({ timeout: t(10000) });

    // Verify we have results (check for "Results" text in result count)
    const resultsText = page.locator('text=/Results/i');
    await expect(resultsText.first()).toBeVisible({ timeout: t(10000) });
  });

  // =================================================================
  // TEST 6: VOICES - Search dropdown sections validation
  // =================================================================
  test('SRCH-006: Voices - Search dropdown sections and icons validation', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Test search dropdown with 'rashi' to trigger all Voices sections
    await pm.onModuleHeader().testSearchDropdown(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.VOICES_SHOW_ALL,
      SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_SECTIONS,
      SEARCH_DROPDOWN.VOICES_EXCLUDED_SECTIONS
    );

    // Test search dropdown icons
    await pm.onModuleHeader().testSearchDropdownIcons(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.VOICES_SHOW_ALL,
      SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_ICONS
    );
  });
});

/**
 * TEST SUMMARY:
 *
 * 6 search tests covering both Library and Voices modules (all @sanity):
 * SRCH-001. Library - Search Suggestion Click: Click topic suggestion and navigate to topic page
 * SRCH-002. Library - Search Submit: Submit search query and verify results page
 * SRCH-003. Library - Dropdown Validation: Validate search dropdown sections and icons
 * SRCH-004. Voices - Search Suggestion Click: Click suggestion and navigate to destination
 * SRCH-005. Voices - Search Submit: Submit search query and verify results page
 * SRCH-006. Voices - Dropdown Validation: Validate Voices-specific dropdown sections and icons
 *
 * KEY FEATURES:
 * - Tests both search suggestion (autocomplete) and search submission flows
 * - Validates module-specific dropdown sections:
 *   - Library: Authors, Topics, Categories, Books (excludes Users)
 *   - Voices: Topics, Authors, Users (excludes Categories, Books)
 * - Validates module-specific icons in dropdown
 * - Tests real user workflows: typing -> clicking suggestion vs typing -> pressing Enter
 * - Independent tests with clear failure isolation
 */
