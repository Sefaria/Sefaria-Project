/**
 * USER MENU — feature-coverage tests (UMN-NNN)
 *
 * Login, profile view/edit, account settings, language switch, module switcher,
 * logout — the flows reachable from the header user menu. Split into independent
 * tests for failure isolation.
 *
 * The @sanity-tagged subset (UMN-002 … UMN-007) is part of the release-gate
 * suite (see Sanity/README.md). UMN-001 (UI login) is intentionally NOT tagged.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import {
  goToPageWithLang,
  goToPageWithUser,
  hideAllModalsAndPopups,
  openHeaderDropdown,
  selectDropdownOption,
  changeLanguage,
} from '../../utils';
import { LANGUAGES, testUser, BROWSER_SETTINGS, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS, MODULE_SELECTORS, EXTERNAL_URLS } from '../../constants';

test.describe.serial('User Menu', () => {

  // =================================================================
  // TEST 1: LOGIN
  // =================================================================
  test('UMN-001: User can login successfully', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Navigate to login page
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');

    // Fill in login credentials
    const loginPage = pm.onLoginPage();
    await loginPage.loginAs(testUser);

    // Wait for login to complete and profile pic to appear
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);

    // Explicitly wait for profile pic to ensure login completed
    const profilePic = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    await profilePic.waitFor({ state: 'visible', timeout: t(10000) });

    // Verify user is logged in
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);
  });

  // =================================================================
  // TEST 2: PROFILE VIEW
  // =================================================================
  test('UMN-002: User can view profile with correct artifacts', { tag: '@sanity' }, async ({ context }) => {
    // Start logged in on Voices (Profile menu only available on Voices)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Navigate to profile via user menu
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Profile');
    // Web-first URL assertion — the profile nav is a client-side (SPA) route
    // change; waitForURL waits for the `load` event, which lags here. toHaveURL
    // polls the URL without depending on `load`.
    await expect(page).toHaveURL(/\/profile\//, { timeout: t(10000) });
    await hideAllModalsAndPopups(page);

    // Verify profile page loaded (#main is hidden, check .content instead)
    await expect(page.locator('.content')).toBeVisible({ timeout: t(10000) });
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
  test('UMN-003: User can edit profile successfully', { tag: '@sanity' }, async ({ context }) => {
    // Start logged in on Voices (where profile lives)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enUser);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Navigate directly to edit profile page (/settings/profile redirects to Voices)
    await page.goto(`${MODULE_URLS.EN.VOICES}/settings/profile`, { waitUntil: 'domcontentloaded' });
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

    // Removes new Modularization popups
    await page.evaluate(() => {
      const overlays = document.querySelectorAll('.floating-ui-popover-content, [id^="downshift-"], #s2');
      overlays.forEach(el => el.remove());
    }).catch(() => { });
    // Save profile changes
    await editProfilePage.saveProfile();
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);

    // Verify we're back on profile page (#main is hidden, check .content instead)
    await expect(page.locator('.content')).toBeVisible({ timeout: t(20000) });
    await expect(page.locator('.title.sub-title')).toContainText(`QA Automation ${timestamp}`);
  });

  // =================================================================
  // TEST 4: ACCOUNT SETTINGS
  // =================================================================
  test('UMN-004: User can edit account settings', { tag: '@sanity' }, async ({ context }) => {
    // Start logged in on Library (Account Settings only available on Library)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enUser);
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
  });



  // =================================================================
  // TEST 5: LANGUAGE SWITCHING
  // =================================================================
  test('UMN-005: User can change site language', { tag: '@sanity' }, async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Verify starts in English
    await expect(page.locator('body')).toHaveClass(/interface-english/);
    await expect(page.getByRole('link', { name: 'Texts' })).toBeVisible();

    // Switch to Hebrew (uses dropdown with cookie fallback)
    await changeLanguage(page, LANGUAGES.HE);
    await page.reload({ waitUntil: 'domcontentloaded' }); // Reload to apply cookie
    await hideAllModalsAndPopups(page);

    // Verify language changed to Hebrew
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
    await expect(page.getByRole('link', { name: 'מקורות' })).toBeVisible();

    // Switch back to English (uses dropdown with cookie fallback)
    await changeLanguage(page, LANGUAGES.EN);
    await page.reload({ waitUntil: 'domcontentloaded' }); // Reload to apply cookie
    await hideAllModalsAndPopups(page);

    // Verify back to English
    await expect(page.locator('body')).toHaveClass(/interface-english/);
  });

  // =================================================================
  // TEST 6: MODULE SWITCHER - ALL DESTINATIONS
  // =================================================================
  test('UMN-006: Module switcher reaches all destinations', { tag: '@sanity' }, async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Navigate to Voices
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    await hideAllModalsAndPopups(page);
    const voicesPage = await pm.onModuleHeader().selectDropdownOption('Voices', true);
    await expect(voicesPage!).toHaveURL(new RegExp(MODULE_URLS.EN.VOICES));
    await voicesPage!.close();

    // Navigate to Developers
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    await hideAllModalsAndPopups(page);
    const developersPage = await pm.onModuleHeader().selectDropdownOption('Developers', true);
    await expect(developersPage!).toHaveURL(EXTERNAL_URLS.DEVELOPERS);
    await developersPage!.close();

    // Navigate to More from Sefaria
    await pm.onModuleHeader().openDropdown(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
    await hideAllModalsAndPopups(page);
    const productsPage = await pm.onModuleHeader().selectDropdownOption('More from Sefaria ›', true);
    await expect(productsPage!).toHaveURL(/\/products$/);
    await productsPage!.close();

    // Verify Library still accessible
    await expect(page).toHaveURL(new RegExp(MODULE_URLS.EN.LIBRARY));
    await expect(page.locator(MODULE_SELECTORS.LOGO.LIBRARY)).toBeVisible();
  });

  // =================================================================
  // TEST 7: LOGOUT
  // =================================================================
  //
  // ⚠️ Uses BROWSER_SETTINGS.enAdmin — NOT enUser — by design.
  //
  // Sefaria's /logout endpoint destroys the user's server-side session row,
  // which invalidates the sessionid cookie in *every* worker context that
  // shares that account's storage state. Every other release-gate spec
  // authenticates as the standard testUser (enUser); if UMN-007 logged that
  // account out, any concurrently-running sheet-lifecycle / cross-module test
  // would suddenly find itself logged out mid-flight. This was the root cause of
  // the chrome-sanity flake where SHT-008–010 (Unpublish / Add to collection /
  // Delete) failed at random under default parallelism (verified 2026-05-20
  // by reproducing the failure and inspecting the screenshot — "User Logged
  // out" pill on the sheet page).
  //
  // The admin account is unused elsewhere in the release-gate suite (verified
  // via grep: enAdmin appears in no other spec). Invalidating its session here
  // therefore has no cross-test effect, while still exercising the real /logout
  // server round-trip — i.e. fidelity is preserved.
  test('UMN-007: User can logout successfully', { tag: '@sanity' }, async ({ context }) => {
    // Start logged in (admin profile — see comment above for why)
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enAdmin);
    const pm = new PageManager(page, LANGUAGES.EN);

    // Verify logged in
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);
    await page.waitForTimeout(t(1000));
    // Perform logout
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log out');
    await page.waitForLoadState('domcontentloaded');
    await hideAllModalsAndPopups(page);

    // Verify user is logged out
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(false);
  });
});

/**
 * TEST SUMMARY:
 *
 * 7 independent user-menu tests (UMN-002 … UMN-007 are @sanity):
 * UMN-001. Login - Verifies authentication works (NOT @sanity)
 * UMN-002. Profile View - Confirms profile displays correctly
 * UMN-003. Profile Edit - Tests profile editing functionality
 * UMN-004. Account Settings - Tests settings modification
 * UMN-005. Language Switch - Tests EN ↔ HE toggle
 * UMN-006. Module Switcher - Tests all 4 destinations
 * UMN-007. Logout - Verifies logout works
 *
 * KEY FIXES:
 * - Profile menu only exists on VOICES module
 * - Account Settings menu only exists on LIBRARY module
 * - Each test uses appropriate module for its functionality
 * - Each test is independent (creates own context/auth state)
 * - Clear failure isolation (know exactly which feature broke)
 */
