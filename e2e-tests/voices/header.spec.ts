/*
 * PURPOSE: Test header functionality for the Voices module
 *   - Voices header navigation and elements
 *   - Voices-specific search dropdown sections and icons
 *   - Create New Sheet button functionality
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import {
  MODULE_URLS,
  SITE_CONFIGS,
  EXTERNAL_URLS,
  SEARCH_DROPDOWN,
  USER_MENU_ITEMS
} from '../constants';

test.describe('Voices Module Header Tests - English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.VOICES, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('MOD-H003: Voices header navigation and elements', { tag: '@sanity' }, async () => {
    const config = SITE_CONFIGS.VOICES;

    await expect(page.locator(config.logo)).toBeVisible();

    // Test main navigation links
    for (const link of config.mainLinks) {
      await pm.onModuleHeader().clickAndVerifyNavigation(link.name, link.expectedUrl);
      await page.goto(config.url);
    }

    // Test donate and help links (new tabs)
    await pm.onModuleHeader().clickAndVerifyNewTab('Donate', EXTERNAL_URLS.DONATE);
    await pm.onModuleHeader().clickAndVerifyNewTab('Help', EXTERNAL_URLS.HELP);

    // Test action button (Create)
    await pm.onModuleHeader().testActionButton(config);
  });

  test('MOD-H011: Voices - Search dropdown sections and icons validation', async () => {
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
    await pm.onModuleHeader().loginWithCredentials(MODULE_URLS.EN.VOICES, true);
    await page.goto(MODULE_URLS.EN.VOICES);
    await hideAllModalsAndPopups(page);

    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);

    const createButton = page.getByRole('banner').getByRole('button', { name: /create/i });

    await createButton.click();

    // Create triggers a client-side (SPA) route change to the new sheet; assert
    // the destination URL directly (poll-based, no dependency on the `load`
    // event, which lags on the Voices SPA).
    await expect(page).toHaveURL(/\/sheets\/(new|\d+)/, { timeout: t(15000) });
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);
    await pm.onModuleHeader().closeGuideOverlay();

    const currentUrl = page.url();
    const isValidSheet = /\/sheets\/(new|\d+)/.test(currentUrl);
    expect(isValidSheet).toBeTruthy();

    // If on a created sheet, delete it for cleanup
    if (/\/sheets\/\d+/.test(currentUrl)) {
      await page.waitForTimeout(t(2000));
      expect(await page.getByRole('button', { name: /publish/i }).count()).toBeGreaterThan(0);

      await pm.onModuleHeader().closeGuideOverlay();

      const optionsButton = page.locator('img[src="/static/icons/ellipses.svg"]');
      await expect(optionsButton).toBeVisible();
      await optionsButton.click();

      const deleteOption = page.locator('text=Delete');
      await expect(deleteOption).toBeVisible();

      page.once('dialog', async dialog => {
        await dialog.accept();
      });

      await deleteOption.click();
      await expect(page).toHaveURL(/\/profile\//, { timeout: t(15000) });
    }

    await pm.onModuleHeader().logout();
  });
});

test.describe('Voices Module Header Tests - Logged In', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('MOD-H017: Voices user menu contains all expected items including Saved and History', { tag: '@sanity' }, async () => {
    await expect(pm.onModuleHeader().isLoggedIn()).resolves.toBe(true);
    // Presence-only: every expected item — notably Saved and History — exists in the
    // logged-in Voices user-menu dropdown.
    await pm.onModuleHeader().assertUserMenuItems(USER_MENU_ITEMS.VOICES_LOGGED_IN);
  });
});
