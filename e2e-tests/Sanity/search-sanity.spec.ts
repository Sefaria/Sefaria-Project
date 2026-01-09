/**
 * SEARCH SANITY TESTS
 *
 * Tests critical search functionality across Library and Voices modules.
 * Validates search suggestions, search results, and dropdown UI elements.
 *
 * PRIORITY: Critical - Run before every release
 */

import { test, expect } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS, SEARCH_DROPDOWN } from '../constants';

test.describe('Search Sanity Tests', () => {

  // =================================================================
  // TEST 1: LIBRARY - Search suggestion click and navigation
  // =================================================================
  test('Sanity 9a: Library - Click search suggestion and arrive at destination', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Type in search to trigger suggestions
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('abraham');

    // Wait for dropdown to appear
    const dropdown = page.locator(SEARCH_DROPDOWN.CONTAINER);
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // Click on the first topic suggestion (should be "Abraham" topic)
    const topicSuggestion = dropdown.locator('.search-suggestion').filter({ hasText: /Abraham/i }).first();
    await expect(topicSuggestion).toBeVisible({ timeout: 5000 });
    await topicSuggestion.click();

    // Wait for navigation
    await page.waitForLoadState('networkidle');

    // Verify we arrived at a topic page
    expect(page.url()).toMatch(/topic|abraham/i);
  });

  // =================================================================
  // TEST 2: LIBRARY - Submit search and verify results
  // =================================================================
  test('Sanity 9b: Library - Submit search and get results', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Type search term and submit
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('avraham');
    await searchBox.press('Enter');

    // Wait for search results page
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Verify we're on search results page
    expect(page.url()).toContain('/search?q=avraham');

    // Verify search results are displayed
    const searchContent = page.locator('.searchContent, .content');
    await expect(searchContent.first()).toBeVisible({ timeout: 10000 });

    // Verify we have results (check for "Results" text in result count)
    const resultsText = page.locator('text=/Results/i');
    await expect(resultsText.first()).toBeVisible({ timeout: 10000 });
  });

  // =================================================================
  // TEST 3: LIBRARY - Search dropdown sections validation
  // =================================================================
  test('Sanity 9c: Library - Search dropdown sections and icons validation', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
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
  test('Sanity 9d: Voices - Click search suggestion and arrive at destination', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Type in search to trigger suggestions
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('rashi');

    // Wait for dropdown to appear
    const dropdown = page.locator(SEARCH_DROPDOWN.CONTAINER);
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // Click on a topic or author suggestion
    const suggestion = dropdown.locator('.search-suggestion').filter({ hasText: /Rashi/i }).first();
    await expect(suggestion).toBeVisible({ timeout: 5000 });
    await suggestion.click();

    // Wait for navigation
    await page.waitForLoadState('networkidle');

    // Verify we arrived at a topic/author page
    expect(page.url()).toMatch(/topic|profile|rashi/i);
  });

  // =================================================================
  // TEST 5: VOICES - Submit search and verify results
  // =================================================================
  test('Sanity 9e: Voices - Submit search and get results', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Type search term and submit
    const searchBox = page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.fill('shabbat');
    await searchBox.press('Enter');

    // Wait for search results page
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Verify we're on search results page
    expect(page.url()).toContain('/search?q=shabbat');

    // Verify search results are displayed
    const searchContent = page.locator('.searchContent, .content');
    await expect(searchContent.first()).toBeVisible({ timeout: 10000 });

    // Verify we have results (check for "Results" text in result count)
    const resultsText = page.locator('text=/Results/i');
    await expect(resultsText.first()).toBeVisible({ timeout: 10000 });
  });

  // =================================================================
  // TEST 6: VOICES - Search dropdown sections validation
  // =================================================================
  test('Sanity 9f: Voices - Search dropdown sections and icons validation', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
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
 * 6 search sanity tests covering both Library and Voices modules:
 * 9a. Library - Search Suggestion Click: Click topic suggestion and navigate to topic page
 * 9b. Library - Search Submit: Submit search query and verify results page
 * 9c. Library - Dropdown Validation: Validate search dropdown sections and icons
 * 9d. Voices - Search Suggestion Click: Click suggestion and navigate to destination
 * 9e. Voices - Search Submit: Submit search query and verify results page
 * 9f. Voices - Dropdown Validation: Validate Voices-specific dropdown sections and icons
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
