import { test, expect, Page } from '@playwright/test';
import { HeaderTestHelpers } from './headerMDL';
import { hideAllModalsAndPopups } from '../utils';
import { UtilTestHelpers } from './utilsMDL';
import { URLS, SELECTORS, EXTERNAL_URLS, SITE_CONFIGS, SEARCH_DROPDOWN, AUTH_CONSTANTS } from './constantsMDL';

test.describe('Modularization Header Tests', () => {
  let helpers: HeaderTestHelpers;
  let utils: UtilTestHelpers;
  
  test.beforeEach(async ({ page }) => {
    helpers = new HeaderTestHelpers(page);
    utils = new UtilTestHelpers(page);
    await utils.navigateAndHideModals(URLS.LIBRARY);
  });

  test('MOD-H001: Logo navigation functionality (EXPECTED TO FAIL)', async ({ page }) => {
    for (const [siteName, config] of Object.entries(SITE_CONFIGS)) {
      await utils.navigateAndHideModals(config.url);
      
      // Navigate to Topics, then try to go back via logo
      await helpers.clickAndVerifyNavigation('Topics', /topics/);
      
      const logo = page.getByRole('banner').locator(config.logo);
      await expect(logo).toBeVisible();
      await logo.click();
      await page.waitForLoadState('networkidle');
      
      // This should fail - logos don't navigate home
      await expect(page).toHaveURL(new RegExp(`^${config.url}/?$`));
    }
  });

  test('MOD-H002: Library header navigation and logo', async ({ page }) => {
    const config = SITE_CONFIGS.LIBRARY;
    
    // Test logo visibility
    await expect(page.locator(config.logo)).toBeVisible();
    
    // Test main navigation links
    for (const link of config.mainLinks) {
      await utils.navigateAndHideModals(config.url);
      await helpers.clickAndVerifyNavigation(link.name, link.expectedUrl);
    }
    
    // Test donate and help link (new tab)
    await utils.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Donate', EXTERNAL_URLS.DONATE);
  
    await utils.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Help', EXTERNAL_URLS.HELP);
  });

  test('MOD-H003: Voices header navigation and elements', async ({ page }) => {
    const config = SITE_CONFIGS.VOICES;
    await utils.navigateAndHideModals(config.url);
    
    // Test logo visibility
    await expect(page.locator(config.logo)).toBeVisible();
    
    // Test main navigation links
    for (const link of config.mainLinks) {
      await utils.navigateAndHideModals(config.url);
      await helpers.clickAndVerifyNavigation(link.name, link.expectedUrl);
    }
    
    // Test donate and help links (new tabs)
    await utils.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Donate', EXTERNAL_URLS.DONATE);
    
    await utils.navigateAndHideModals(config.url);
    await helpers.clickAndVerifyNewTab('Help', EXTERNAL_URLS.HELP);
    
    // Test action button (Create)
    await utils.navigateAndHideModals(config.url);
    await helpers.testActionButton(config);
  });

  test('MOD-H004: Search functionality across both sites', async ({ page }) => {
    // Test Library search
    await helpers.testSearch('Genesis 1:1', /Genesis/);
    
    // Test Sheets search
    await utils.navigateAndHideModals(URLS.VOICES);
    await helpers.testSearch('Passover', /search|Passover/);
  });

  test('MOD-H005: Language switcher functionality', async ({ page }) => {
    await expect(page.locator('body')).toHaveClass(/interface-english/);
    await expect(page.getByRole('link', { name: 'Texts' })).toBeVisible();

    await helpers.openDropdown(SELECTORS.ICONS.LANGUAGE);
    await helpers.selectDropdownOption('עברית');
    
    await expect(page.locator('body')).toHaveClass(/interface-hebrew/);
    await expect(page.getByRole('link', { name: 'מקורות' })).toBeVisible();
  });

  test('MOD-H006: Module switcher navigation', async ({ page }) => {
    // Test Voices navigation (new tab)
    await helpers.openDropdown(SELECTORS.ICONS.MODULE_SWITCHER);
    let newPage = await helpers.selectDropdownOption('Voices', true);
    await expect(newPage!).toHaveURL(SITE_CONFIGS.VOICES.url);
    await newPage!.close();
    
    // Test Developers navigation (new tab)
    await helpers.openDropdown(SELECTORS.ICONS.MODULE_SWITCHER);
    newPage = await helpers.selectDropdownOption('Developers', true);
    await expect(newPage!).toHaveURL(EXTERNAL_URLS.DEVELOPERS);
    await newPage!.close();
  });

  test('MOD-H007: User authentication menu', async ({ page }) => {
    await helpers.openDropdown(SELECTORS.ICONS.USER_MENU);
    await helpers.selectDropdownOption('Log in');
    
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  });

  test('MOD-H008: Browser navigation controls (back/forward buttons)', async ({ page }) => {
    await helpers.clickAndVerifyNavigation('Topics', /topics/);
    
    const topicLink = page.getByRole('link').filter({ hasText: /Jewish Calendar/i }).first();
    await topicLink.isVisible();
    await topicLink.click();
    await expect(page).toHaveURL(/category/);
    
    await page.goBack();
    await expect(page).toHaveURL(/topics/);
    
    await page.goForward();
    await expect(page).toHaveURL(/category/);
  });

  test('MOD-H009a: Header - Keyboard navigation accessibility ', async ({ page }) => {
    for (const [siteName, config] of Object.entries(SITE_CONFIGS)) {
      await utils.navigateAndHideModals(config.url);
      await helpers.testTabOrder(config.tabOrder);
    }
  });

  test('MOD-H009b: Module switcher - Keyboard navigation accessibility', async ({ page }) => {
    for (const [siteName, config] of Object.entries(SITE_CONFIGS)) {
      await utils.navigateAndHideModals(config.url);
      await helpers.testModuleSwitcherKeyboard();
    }
  });

  test('MOD-H010: Library - Search dropdown sections and icons validation', async ({ page }) => {
    // Test search dropdown with 'mid' to trigger all sections
    await helpers.testSearchDropdown('mid', SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS, SEARCH_DROPDOWN.LIBRARY_EXCLUDED_SECTIONS);
    await helpers.testSearchDropdownIcons('mid', SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_ICONS);    
  });

  test('MOD-H011: Voices - Search dropdown sections and icons validation', async ({ page }) => {
    // Navigate to Voices site for testing
    await utils.navigateAndHideModals(URLS.VOICES);
    
    // Test search dropdown with 'rashi' to trigger Topics, Authors, and Users sections
    await helpers.testSearchDropdown('rashi', SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_SECTIONS, SEARCH_DROPDOWN.VOICES_EXCLUDED_SECTIONS);
    await helpers.testSearchDropdownIcons('rashi', SEARCH_DROPDOWN.VOICES_ALL_EXPECTED_ICONS);
  });

  test('MOD-H012: User authentication flow across both sites', async ({ page }) => {
    // Test Library site authentication
    await utils.navigateAndHideModals(URLS.LIBRARY);
    
    // Login with superuser (known working credentials)
    await helpers.loginWithCredentials(URLS.LIBRARY, 'superUser');
    
    // Verify logged-in state on Library
    await expect(helpers.isLoggedIn()).resolves.toBe(true);
    
    // Navigate to Voices - auth should persist
    await utils.navigateAndHideModals(URLS.VOICES);
    await expect(helpers.isLoggedIn()).resolves.toBe(true);
    
    // Test logout
    await helpers.logout();
    await expect(helpers.isLoggedIn()).resolves.toBe(false);
  });

  test('MOD-H013: User menu differences between logged-in/out states', async ({ page }) => {
    await helpers.testWithAuthStates(async (isLoggedIn: boolean) => {
      
      if (isLoggedIn) {
        // For logged-in state, click the user profile (PP initials)
        const userProfile = page.locator('.default-profile-img');
        await userProfile.click();
        
        // Should show user-specific options
        const logoutOption = page.locator(SELECTORS.DROPDOWN_OPTION)
          .filter({ hasText: /log out|sign out|logout/i });
        await expect(logoutOption).toBeVisible();
        
        // May have profile, settings, etc.
        const profileOption = page.locator(SELECTORS.DROPDOWN_OPTION)
          .filter({ hasText: /profile|account/i });
        // Note: Only check if it exists, might not be implemented yet
        
      } else {
        // For logged-out state, use the logged-out icon
        await helpers.openDropdown(SELECTORS.ICONS.USER_MENU);
        
        // Should show login/signup options
        const loginOption = page.locator(SELECTORS.DROPDOWN_OPTION)
          .filter({ hasText: /log in|sign in/i });
        await expect(loginOption).toBeVisible();
        
        const signupOption = page.locator(SELECTORS.DROPDOWN_OPTION)
          .filter({ hasText: /sign up|register/i });
        await expect(signupOption).toBeVisible();
      }
      
      // Close dropdown
      await page.keyboard.press('Escape');
    });
  });

  test('MOD-H014: Create New Sheet button functionality when logged in', async ({ page }) => {
    // Navigate to Voices site and login
    await utils.navigateAndHideModals(URLS.VOICES);
    await helpers.loginWithCredentials(URLS.VOICES, 'superUser');
    
    // After login, navigate back to Voices home to avoid any redirect issues
    await utils.navigateAndHideModals(URLS.VOICES);
    
    // Verify logged-in state on Voices
    await expect(helpers.isLoggedIn()).resolves.toBe(true);
    
    // Find and test the Create button
    const createButton = page.getByRole('banner').getByRole('button', { name: /create/i });
    await expect(createButton).toBeVisible();
    
    // Get the current URL before clicking
    const initialUrl = page.url();
    // Close all popups
    await hideAllModalsAndPopups(page);
    
    // Check if the Create button has a nested link
    const createLink = page.getByRole('banner').getByRole('link', { name: /create/i });
    const hasNestedLink = await createLink.count() > 0;
    
    if (hasNestedLink) {
      await createLink.click();
    } else {
      await createButton.click();
    }
    
    // Wait for navigation to occur
    await page.waitForURL(url => url.toString() !== initialUrl, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    // Close guide overlay if it appears after creating a sheet
    await hideAllModalsAndPopups(page);
    await utils.closeGuideOverlay();
    
    // Verify navigation to either /sheets/new or a newly created sheet (with numeric ID)
    // The Create button may directly create a sheet rather than going to a creation form
    const currentUrl = page.url();
    const isNewSheetPage = /\/sheets\/new/.test(currentUrl);
    const isCreatedSheet = /\/sheets\/\d+/.test(currentUrl);
    
    expect(isNewSheetPage || isCreatedSheet).toBeTruthy();
    
    // If we're on a created sheet, verify we're in the sheet editor and clean up
    if (isCreatedSheet) {
      // Verify we're on the sheet editor page by checking for key elements
      
      // Wait a bit for the sheet editor to load
      await page.waitForTimeout(2000);
      
      // Look for basic sheet editor elements
      const publishButton = page.getByRole('button', { name: /publish/i });
      const publishExists = await publishButton.count() > 0;
      
      // Verify we have the publish button (confirms we're in sheet editor)
      expect(publishExists).toBeTruthy();
      
      // Now delete the sheet to clean up
      
      // Make sure guide overlay is closed (may reappear)
      await utils.closeGuideOverlay();
      
      // Click the Options button (ellipses)
      const optionsButton = page.locator('img[src="/static/icons/ellipses.svg"]');
      await expect(optionsButton).toBeVisible();
      await optionsButton.click();
      
      // Wait for dropdown to appear and click "Delete"
      const deleteOption = page.locator('text=Delete');
      await expect(deleteOption).toBeVisible();
      
      // Set up dialog handler to automatically accept it
      page.once('dialog', async dialog => {
        await dialog.accept();
      });
      
      // Set up navigation promise before clicking delete
      const navigationPromise = page.waitForURL(/\/profile\//, { timeout: 15000 });
      
      // Click delete - this will trigger the dialog
      await deleteOption.click();
      
      // Wait for navigation to profile page
      await navigationPromise;
      await page.waitForLoadState('networkidle');
      
      // Verify we navigated to the profile page after deletion
      const deletionUrl = page.url();
      const isOnProfilePage = /\/profile\//.test(deletionUrl);
      expect(isOnProfilePage).toBeTruthy();
    } 
    else {
      // Throw error if not on expected pages
      throw new Error(`Unexpected URL after clicking Create: ${currentUrl}`);
    }
    
    // Cleanup: logout
    await helpers.logout();
  });
});

