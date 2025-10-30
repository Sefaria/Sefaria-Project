/*
 * PURPOSE: Test header functionality for the Library module
 *   - Library header navigation and logo
 *   - Library-specific search dropdown sections and icons
 *   - Cross-module functionality (logo navigation, language switcher, module switcher, auth)
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import {
  MODULE_URLS,
  SITE_CONFIGS,
  EXTERNAL_URLS,
  SEARCH_DROPDOWN,
  MODULE_SELECTORS
} from '../constants';

test.describe('Library Module Header Tests - English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
  });

  test('MOD-H002: Library header navigation and logo', async () => {
    const config = SITE_CONFIGS.LIBRARY;

    // Test logo visibility
    await expect(page.locator(config.logo)).toBeVisible();

    // Test main navigation links
    for (const link of config.mainLinks) {
      await page.goto(config.url);
      await pm.onModuleHeader().clickAndVerifyNavigation(link.name, link.expectedUrl);
    }

    // Test donate and help link (new tab)
    await page.goto(config.url);
    await pm.onModuleHeader().clickAndVerifyNewTab('Donate', EXTERNAL_URLS.DONATE);

    await page.goto(config.url);
    await pm.onModuleHeader().clickAndVerifyNewTab('Help', EXTERNAL_URLS.HELP);
  });

  test('MOD-H010: Library - Search dropdown sections and icons validation', async () => {
    // Test search dropdown with 'mid' to trigger all sections
    await pm.onModuleHeader().testSearchDropdown(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.LIBRARY_SHOW_ALL,
      SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS,
      SEARCH_DROPDOWN.LIBRARY_EXCLUDED_SECTIONS
    );

    await pm.onModuleHeader().testSearchDropdownIcons(
      SEARCH_DROPDOWN.TEST_SEARCH_TERMS.LIBRARY_SHOW_ALL,
      SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_ICONS
    );
  });

  test('MOD-H001: Logo navigation functionality', async () => {
    const config = SITE_CONFIGS.LIBRARY;

    // Navigate to Topics, then try to go back via logo
    await pm.onModuleHeader().clickAndVerifyNavigation('Topics', /topics/);

    const logo = page.getByRole('banner').locator(config.logo);
    await expect(logo).toBeVisible();
    await logo.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`${config.url}(/texts)?`));
  });

  test('MOD-H004: Search functionality', async () => {
    await pm.onModuleHeader().testSearch('Genesis 1:1', /Genesis/);
  });

  test('MOD-H005: Language switcher functionality', async () => {
    // Verify starts in English
    await expect(page.locator('body')).toHaveClass(/interface-english/);
    await expect(page.getByRole('link', { name: 'Texts' })).toBeVisible();

    // Switch to Hebrew
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.LANGUAGE);
    await pm.onModuleHeader().selectDropdownOption('עברית', false, MODULE_SELECTORS.LANGUAGE_SWITCHER_GLOBE);

    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
    await expect(page.getByRole('link', { name: 'מקורות' })).toBeVisible();
  });

  test('MOD-H006: Module switcher navigation', async () => {
    // Test Voices navigation (new tab)
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    let newPage = await pm.onModuleHeader().selectDropdownOption('Voices', true);
    await expect(newPage!).toHaveURL(SITE_CONFIGS.VOICES.url);
    await newPage!.close();

    // Test Developers navigation (new tab)
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    newPage = await pm.onModuleHeader().selectDropdownOption('Developers', true);
    await expect(newPage!).toHaveURL(EXTERNAL_URLS.DEVELOPERS);
    await newPage!.close();
  });

  test('MOD-H007: User authentication menu', async () => {
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.USER_MENU);
    await pm.onModuleHeader().selectDropdownOption('Log in');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  });

  test('MOD-H008: Browser navigation controls (back/forward buttons)', async () => {
    await pm.onModuleHeader().clickAndVerifyNavigation('Topics', /topics/);

    const topicLink = page.getByRole('link').filter({ hasText: /Jewish Calendar/i }).first();
    await topicLink.isVisible();
    await topicLink.click();
    await expect(page).toHaveURL(/category/);

    await page.goBack();
    await expect(page).toHaveURL(/topics/);

    await page.goForward();
    await expect(page).toHaveURL(/category/);
  });

  test('MOD-H009a: Header - Keyboard navigation accessibility', async () => {
    const config = SITE_CONFIGS.LIBRARY;
    await pm.onModuleHeader().testTabOrder(config.tabOrder);
  });

  test('MOD-H009b: Module switcher - Keyboard navigation accessibility', async () => {
    await pm.onModuleHeader().testModuleSwitcherKeyboard();
  });

  test('MOD-H012: User authentication flow across Library and Voices', async () => {
    // Login with superuser
    await pm.onModuleHeader().loginWithCredentials(MODULE_URLS.LIBRARY, true);

    // Verify logged-in state on Library
    await expect(pm.onModuleHeader().isLoggedIn()).resolves.toBe(true);

    // Navigate to Voices - auth should persist
    await page.goto(MODULE_URLS.VOICES);
    await hideAllModalsAndPopups(page);
    await expect(pm.onModuleHeader().isLoggedIn()).resolves.toBe(true);

    // Test logout
    await pm.onModuleHeader().logout();
    await expect(pm.onModuleHeader().isLoggedIn()).resolves.toBe(false);
  });

  test('MOD-H013: User menu differences between logged-in/out states', async () => {
    await pm.onModuleHeader().testWithAuthStates(async (isLoggedIn: boolean) => {
      if (isLoggedIn) {
        // For logged-in state, click the user profile (PP initials)
        const userProfile = page.locator('.default-profile-img');
        await userProfile.click();

        // Should show user-specific options
        const logoutOption = page.locator(MODULE_SELECTORS.DROPDOWN_OPTION)
          .filter({ hasText: /log out|sign out|logout/i });
        await expect(logoutOption).toBeVisible();

      } else {
        // For logged-out state, use the logged-out icon
        await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.USER_MENU);

        // Should show login/signup options
        const loginOption = page.locator(MODULE_SELECTORS.DROPDOWN_OPTION)
          .filter({ hasText: /log in|sign in/i });
        await expect(loginOption).toBeVisible();

        const signupOption = page.locator(MODULE_SELECTORS.DROPDOWN_OPTION)
          .filter({ hasText: /sign up|register/i });
        await expect(signupOption).toBeVisible();
      }

      // Close dropdown
      await page.keyboard.press('Escape');
    }, MODULE_URLS.LIBRARY);
  });
});