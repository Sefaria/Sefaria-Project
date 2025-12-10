/**
 * USER FLOW SANITY TESTS
 *
 * Split into independent tests for better failure isolation and reporting.
 * Each test validates one critical user flow.
 *
 * PRIORITY: Critical - Run before every release
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import {
  goToPageWithLang,
  goToPageWithUser,
  hideAllModalsAndPopups,
  openHeaderDropdown,
  selectDropdownOption,
  changeLanguage,
} from '../utils';
import { LANGUAGES, testUser, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS, MODULE_SELECTORS, EXTERNAL_URLS } from '../constants';

test.describe('User Flow Sanity Tests', () => {

  // =================================================================
  // TEST 1: LOGIN
  // =================================================================
  test('Sanity 1: User can login successfully', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);

    // Navigate to login page
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');

    // Fill in login credentials
    const loginPage = pm.onLoginPage();
    await loginPage.loginAs(testUser);

    // Wait for login to complete and profile pic to appear
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Explicitly wait for profile pic to ensure login completed
    const profilePic = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await profilePic.waitFor({ state: 'visible', timeout: 10000 });

    // Verify user is logged in
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);
  });

  // =================================================================
  // TEST 2: PROFILE VIEW
  // =================================================================
  test('Sanity 2: User can view profile with correct artifacts', async ({ context }) => {
    // Start logged in on Voices (Profile menu only available on Voices)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Navigate to profile via user menu
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Profile');
    await page.waitForURL(/\/profile\//, { timeout: 10000 });
    await hideAllModalsAndPopups(page);

    // Verify profile page loaded (#main is hidden, check .content instead)
    await expect(page.locator('.content')).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain('/profile/');

    // Verify profile artifacts
    const profilePage = pm.onProfilePage();
    await profilePage.verifyProfileArtifacts({
      name: 'QA Automation',
      hasBio: false,
    });

    // Verify edit button is visible (only on own profile)
    await profilePage.verifyEditButtonVisible();
  });

  // =================================================================
  // TEST 3: PROFILE EDITING
  // =================================================================
  test('Sanity 3: User can edit profile successfully', async ({ context }) => {
    // Start logged in on Voices (where profile lives)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Navigate directly to edit profile page (/settings/profile redirects to Voices)
    await page.goto(`${MODULE_URLS.EN.VOICES}/settings/profile`, { waitUntil: 'networkidle' });
    await hideAllModalsAndPopups(page);

    // Verify edit profile page loaded
    const editProfilePage = pm.onEditProfilePage();
    await editProfilePage.verifyPageLoaded();

    // Edit profile fields
    const timestamp = Date.now();
    await hideAllModalsAndPopups(page);
    await editProfilePage.editMultipleFields({
      position: `QA Automation ${timestamp}`,
      organization: 'Sefaria Test Automation',
      location: 'Test City',
    });

    await page.evaluate(() => {
      const overlays = document.querySelectorAll('.floating-ui-popover-content, [id^="downshift-"], #s2');
      overlays.forEach(el => el.remove());
    }).catch(() => { });
    // Save profile changes
    await editProfilePage.saveProfile();
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Verify we're back on profile page (#main is hidden, check .content instead)
    await expect(page.locator('.content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.title.sub-title')).toContainText(`QA Automation ${timestamp}`);
  });

  // =================================================================
  // TEST 4: ACCOUNT SETTINGS
  // =================================================================
  test('Sanity 4: User can edit account settings', async ({ context }) => {
    // Start logged in on Library (Account Settings only available on Library)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Navigate to account settings via user menu
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Account Settings');
    await hideAllModalsAndPopups(page);

    // Verify account settings page loaded
    const accountSettingsPage = pm.onAccountSettingsPage();
    await accountSettingsPage.verifyPageLoaded();

    // Verify email is displayed
    await accountSettingsPage.verifyEmailDisplayed(testUser.email);

    // Change some settings
    await accountSettingsPage.changeSettings({
      emailNotifications: 'weekly',
      readingHistory: true,
      textualCustom: 'ashkenazi',
    });

    // Save settings
    await accountSettingsPage.saveSettings();
    await page.waitForTimeout(2000);
  });

  // =================================================================
  // TEST 5: LOGOUT
  // =================================================================
  test('Sanity 5: User can logout successfully', async ({ context }) => {
    // Start logged in
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enUser);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Verify logged in
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);

    // Perform logout
    await pm.onModuleHeader().logout();
    await page.waitForLoadState('networkidle');
    await hideAllModalsAndPopups(page);

    // Verify user is logged out
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(false);
  });

  // =================================================================
  // TEST 6: LANGUAGE SWITCHING
  // =================================================================
  test('Sanity 6: User can change site language', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Verify starts in English
    await expect(page.locator('body')).toHaveClass(/interface-english/);
    await expect(page.getByRole('link', { name: 'Texts' })).toBeVisible();

    // Switch to Hebrew (uses dropdown with cookie fallback)
    await changeLanguage(page, LANGUAGES.HE);
    await page.reload({ waitUntil: 'networkidle' }); // Reload to apply cookie
    await hideAllModalsAndPopups(page);

    // Verify language changed to Hebrew
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
    await expect(page.getByRole('link', { name: 'מקורות' })).toBeVisible();

    // Switch back to English (uses dropdown with cookie fallback)
    await changeLanguage(page, LANGUAGES.EN);
    await page.reload({ waitUntil: 'networkidle' }); // Reload to apply cookie
    await hideAllModalsAndPopups(page);

    // Verify back to English
    await expect(page.locator('body')).toHaveClass(/interface-english/);
  });

  // =================================================================
  // TEST 7: MODULE SWITCHER - ALL DESTINATIONS
  // =================================================================
  test('Sanity 7: Module switcher reaches all destinations', async ({ context }) => {
    console.log('Test 7: Module switcher');

    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    const pm = new PageManager(page, LANGUAGES.EN);

    // 7a. Navigate to Voices
    console.log('  Testing Voices...');
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    const voicesPage = await pm.onModuleHeader().selectDropdownOption('Voices', true);
    await expect(voicesPage!).toHaveURL(new RegExp(MODULE_URLS.EN.VOICES));
    console.log('  ✓ Voices accessible');
    await voicesPage!.close();

    // 7b. Navigate to Developers
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    const developersPage = await pm.onModuleHeader().selectDropdownOption('Developers', true);
    await expect(developersPage!).toHaveURL(EXTERNAL_URLS.DEVELOPERS);
    await developersPage!.close();

    // 7c. Navigate to More from Sefaria
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    const productsPage = await pm.onModuleHeader().selectDropdownOption('More from Sefaria ›', true);
    await expect(productsPage!).toHaveURL(/\/products$/);
    await productsPage!.close();

    // 7d. Verify Library still accessible
    console.log('  Testing Library...');
    await expect(page).toHaveURL(new RegExp(MODULE_URLS.EN.LIBRARY));
    await expect(page.locator(MODULE_SELECTORS.LOGO.LIBRARY)).toBeVisible();
    console.log('  ✓ Library confirmed');

    console.log('✓ All module switcher destinations working');
  });
});

/**
 * TEST SUMMARY:
 *
 * 7 independent sanity tests:
 * 1. Login - Verifies authentication works
 * 2. Profile View - Confirms profile displays correctly
 * 3. Profile Edit - Tests profile editing functionality
 * 4. Account Settings - Tests settings modification
 * 5. Logout - Verifies logout works
 * 6. Language Switch - Tests EN ↔ HE toggle
 * 7. Module Switcher - Tests all 4 destinations
 *
 * KEY FIXES:
 * - Profile menu only exists on VOICES module
 * - Account Settings menu only exists on LIBRARY module
 * - Each test uses appropriate module for its functionality
 * - Each test is independent (creates own context/auth state)
 * - Clear failure isolation (know exactly which feature broke)
 */
