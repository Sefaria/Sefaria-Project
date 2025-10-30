/*
 * PURPOSE: Test header functionality for the Voices module
 *   - Voices header navigation and elements
 *   - Voices-specific search dropdown sections and icons
 *   - Create New Sheet button functionality
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import {
  MODULE_URLS,
  SITE_CONFIGS,
  EXTERNAL_URLS,
  SEARCH_DROPDOWN
} from '../constants';

test.describe('Voices Module Header Tests - English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('MOD-H003: Voices header navigation and elements', async () => {
    const config = SITE_CONFIGS.VOICES;

    // Test logo visibility
    await expect(page.locator(config.logo)).toBeVisible();

    // Test main navigation links
    for (const link of config.mainLinks) {
      await page.goto(config.url);
      await pm.onModuleHeader().clickAndVerifyNavigation(link.name, link.expectedUrl);
    }

    // Test donate and help links (new tabs)
    await page.goto(config.url);
    await pm.onModuleHeader().clickAndVerifyNewTab('Donate', EXTERNAL_URLS.DONATE);

    await page.goto(config.url);
    await pm.onModuleHeader().clickAndVerifyNewTab('Help', EXTERNAL_URLS.HELP);

    // Test action button (Create)
    await page.goto(config.url);
    await pm.onModuleHeader().testActionButton(config);
  });

  test('MOD-H011: Voices - Search dropdown sections and icons validation', async () => {
    // Test search dropdown with 'rashi' to trigger Topics, Authors, and Users sections
    await pm.onModuleHeader().testSearchDropdown(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.VOICES_SHOW_ALL,
      SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_SECTIONS,
      SEARCH_DROPDOWN.VOICES_EXCLUDED_SECTIONS
    );

    await pm.onModuleHeader().testSearchDropdownIcons(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.VOICES_SHOW_ALL,
      SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_ICONS
    );
  });

  test('MOD-H014: Create New Sheet button functionality when logged in', async () => {
    // Login
    await pm.onModuleHeader().loginWithCredentials(MODULE_URLS.VOICES, true);

    // After login, navigate back to Voices home
    await page.goto(MODULE_URLS.VOICES);
    await hideAllModalsAndPopups(page);

    // Verify logged-in state
    await expect(pm.onModuleHeader().isLoggedIn()).resolves.toBe(true);

    // Find and test the Create button
    const createButton = page.getByRole('banner').getByRole('button', { name: /create/i });
    await expect(createButton).toBeVisible();

    const initialUrl = page.url();
    await hideAllModalsAndPopups(page);

    // Check if the Create button has a nested link
    const createLink = page.getByRole('banner').getByRole('link', { name: /create/i });
    const hasNestedLink = await createLink.count() > 0;

    if (hasNestedLink) {
      await createLink.click();
    } else {
      await createButton.click();
    }

    // Wait for navigation
    await page.waitForURL(url => url.toString() !== initialUrl, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Close guide overlay
    await hideAllModalsAndPopups(page);
    await pm.onModuleHeader().closeGuideOverlay();

    // Verify navigation
    const currentUrl = page.url();
    const isNewSheetPage = /\/sheets\/new/.test(currentUrl);
    const isCreatedSheet = /\/sheets\/\d+/.test(currentUrl);

    expect(isNewSheetPage || isCreatedSheet).toBeTruthy();

    // If on a created sheet, verify and clean up
    if (isCreatedSheet) {
      await page.waitForTimeout(2000);

      const publishButton = page.getByRole('button', { name: /publish/i });
      const publishExists = await publishButton.count() > 0;
      expect(publishExists).toBeTruthy();

      // Delete the sheet
      await pm.onModuleHeader().closeGuideOverlay();

      const optionsButton = page.locator('img[src="/static/icons/ellipses.svg"]');
      await expect(optionsButton).toBeVisible();
      await optionsButton.click();

      const deleteOption = page.locator('text=Delete');
      await expect(deleteOption).toBeVisible();

      page.once('dialog', async dialog => {
        await dialog.accept();
      });

      const navigationPromise = page.waitForURL(/\/profile\//, { timeout: 15000 });
      await deleteOption.click();
      await navigationPromise;
      await page.waitForLoadState('networkidle');

      const deletionUrl = page.url();
      const isOnProfilePage = /\/profile\//.test(deletionUrl);
      expect(isOnProfilePage).toBeTruthy();
    } else {
      throw new Error(`Unexpected URL after clicking Create: ${currentUrl}`);
    }

    // Cleanup: logout
    await pm.onModuleHeader().logout();
  });
});
