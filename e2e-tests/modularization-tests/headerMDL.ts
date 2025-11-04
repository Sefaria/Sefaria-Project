import { expect, Page } from '@playwright/test';
import { hideAllModalsAndPopups } from '../utils';
import { SELECTORS, SiteConfig, TabOrderItem, SEARCH_DROPDOWN, AUTH_CONSTANTS, AuthUser, MODULE_SWITCHER } from './constantsMDL';

/**
 * Helper class for testing header functionality across Sefaria's modularization sites.
 * Provides reusable methods for common header interactions and validations.
 */
export class HeaderTestHelpers {
  constructor(private page: Page) {}

 
  /**
   * Clicks a navigation link in the banner and verifies it navigates to the expected URL on the same tab.
   * @param linkName - The accessible name of the link to click
   * @param expectedUrl - RegExp pattern that the resulting URL should match
   */
  async clickAndVerifyNavigation(linkName: string, expectedUrl: RegExp) {
    const link = this.page.getByRole('banner').getByRole('link', { name: linkName });
    await expect(link).toBeVisible();
    await link.click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.page).toHaveURL(expectedUrl);
  }

  /**
   * Clicks a link that should open in a new tab and verifies the new tab's URL.
   * Automatically closes the new tab after verification.
   * @param linkName - The accessible name of the link to click
   * @param expectedUrl - RegExp pattern that the new tab's URL should match
   */
  async clickAndVerifyNewTab(linkName: string, expectedUrl: RegExp) {
    const link = this.page.getByRole('banner').getByRole('link', { name: linkName });
    await expect(link).toBeVisible();
    
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      link.click()
    ]);
    
    await newPage.waitForLoadState('domcontentloaded');
    await expect(newPage).toHaveURL(expectedUrl);
    await newPage.close();
  }

  /**
   * Tests action button functionality (e.g., Create, Sign Up) and handles authentication flows.
   * Verifies the button leads to either the expected page or login page for unauthenticated users.
   * @param config - Site configuration containing action button details
   */
  async testActionButton(config: SiteConfig) {
    const button = this.page.getByRole('banner').getByRole('button').filter({ hasText: config.actionButton.text });
    await expect(button).toBeVisible();
    await button.click();
    await this.page.waitForLoadState('networkidle');
    
    const currentUrl = this.page.url();
    const isExpectedPage = currentUrl.includes(config.actionButton.href) || currentUrl.includes('/login');
    expect(isExpectedPage).toBeTruthy();
  }

  /**
   * Tests search functionality by entering a search term and verifying navigation.
   * @param searchTerm - The text to search for
   * @param expectedUrlPattern - RegExp pattern that the search results URL should match
   */
  async testSearch(searchTerm: string, expectedUrlPattern: RegExp) {
    const searchBox = this.page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await expect(searchBox).toBeVisible();
    await searchBox.fill(searchTerm);
    await searchBox.press('Enter');
    await this.page.waitForLoadState('networkidle');
    await expect(this.page).toHaveURL(expectedUrlPattern);
  }

  /**
   * Opens a dropdown menu by clicking the specified icon.
   * @param iconSelector - CSS selector for the icon that opens the dropdown
   */
  async openDropdown(iconSelector: string) {
    const icon = this.page.locator(iconSelector);
    await icon.waitFor({ state: 'visible', timeout: 5000 });
    await icon.click();
    // Wait for dropdown options to appear (tolerant)
    const possibleOptions = this.page.locator(`${SELECTORS.DROPDOWN_OPTION}, ${SELECTORS.MODULE_DROPDOWN_OPTIONS}`);
    await possibleOptions.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  }

  /**
   * Selects an option from a dropdown menu, with support for new tab navigation.
   * @param optionText - The text content of the dropdown option to select
   * @param shouldOpenNewTab - Whether the option should open in a new tab (default: false)
   * @param dropdownSelector - Optional custom selector for the dropdown options (defaults to SELECTORS.DROPDOWN_OPTION)
   * @returns Promise<Page | null> - The new page if opened in new tab, null otherwise
   */
  async selectDropdownOption(optionText: string, shouldOpenNewTab = false, dropdownSelector?: string) {
    const baseSelector = dropdownSelector || SELECTORS.DROPDOWN_OPTION;
    const dropdownContainer = this.page.locator(SELECTORS.DROPDOWN);
    await dropdownContainer.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const option = this.page.locator(baseSelector).filter({ hasText: optionText }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });

    if (shouldOpenNewTab) {
      const [newPage] = await Promise.all([
        this.page.context().waitForEvent('page'),
        option.click()
      ]);
      await newPage.waitForLoadState('networkidle');
      return newPage;
    } else {
      await option.click();
      await this.page.waitForLoadState('networkidle');
      return null;
    }
  }

  /**
   * Tests keyboard navigation through header elements in the correct tab order.
   * Establishes focus by clicking the logo, then tabs through elements verifying each receives focus.
   * @param tabOrder - Array of elements with selectors and descriptions in expected tab order
   */
  async testTabOrder(tabOrder: ReadonlyArray<TabOrderItem>) {
    // Click logo to establish starting point
    const logo = this.page.locator('img.home').first();
    await logo.click();
    await this.page.waitForTimeout(500);
    
    // Tab through elements
    for (const item of tabOrder) {
      await this.page.keyboard.press('Tab');
      const element = this.page.locator(item.selector).first();
      const currentlyFocused = await this.page.evaluate(() => document.activeElement?.textContent?.trim() || 'none');
      await expect(element, `Expected focus on ${item.description}, but focused on ${currentlyFocused}`).toBeFocused();
    }
  }

  /**
   * Tests keyboard navigation through the module switcher dropdown.
   * Opens the dropdown, tabs through options, and closes with Escape key.
   */
  async testModuleSwitcherKeyboard() {
    await this.openDropdown(SELECTORS.ICONS.MODULE_SWITCHER);
    
    const libraryOption = this.page.locator(SELECTORS.MODULE_DROPDOWN_OPTIONS).filter({ hasText: 'Library' });
    await expect(libraryOption).toBeVisible();
    
    // Tab through module options
    for (const option of MODULE_SWITCHER.options) {
      await this.page.keyboard.press('Tab');
      const moduleOption = this.page.locator(SELECTORS.MODULE_DROPDOWN_OPTIONS).filter({ hasText: option.name });
      const currentlyFocused = await this.page.evaluate(() => document.activeElement?.textContent?.trim() || 'none');
      await expect(moduleOption, `Expected focus on ${option.name}, but focused on ${currentlyFocused}`).toBeFocused();
    }
    
    // Close with Escape
    await this.page.keyboard.press('Escape');
    await expect(libraryOption).not.toBeVisible();
  }

  /**
   * Logs in using the provided credentials on the specified site.
   * Uses form-filling logic similar to LoginPage but without language switching.
   * @param siteUrl - The site URL to login to (Library or Sheets)
   * @param userType - Which user credentials to use ('testUser' or 'superUser')
   */
  async loginWithCredentials(siteUrl: string, userType: AuthUser = 'testUser') {
    const credentials = userType === 'superUser' 
      ? AUTH_CONSTANTS.SUPERUSER 
      : AUTH_CONSTANTS.TEST_USER;

    // Determine correct login URL based on site
    const loginUrl = siteUrl.includes('voices')
      ? AUTH_CONSTANTS.LOGIN_URLS.VOICES
      : AUTH_CONSTANTS.LOGIN_URLS.LIBRARY;

    // Navigate to login page
    await this.page.goto(loginUrl);
    await this.page.waitForLoadState('networkidle');

    // Fill in login form using the same approach as LoginPage
    await this.page.getByPlaceholder('Email Address').fill(credentials.email);
    await this.page.getByPlaceholder('Password').fill(credentials.password);
    await this.page.getByRole('button', { name: 'Login' }).click();
    
    // Wait for successful login (should redirect)
    await this.page.waitForLoadState('networkidle');
    
    // Verify login success
    await this.verifyLoggedIn();
  }

  /**
   * Verifies that user is currently logged in by checking UI indicators.
   */
  async verifyLoggedIn() {
    // Wait for redirect after login and ensure we're not on login page
    await this.page.waitForLoadState('networkidle');
    
    // Check that we're not on the login page anymore
    const currentUrl = this.page.url();
    expect(currentUrl).not.toMatch(/\/login/);
    
    // Check that logged-out icon is NOT present (should be 0 count when logged in)
    const loggedOutIcon = this.page.locator('img[src="/static/icons/logged_out.svg"]');
    const iconCount = await loggedOutIcon.count();
    expect(iconCount).toBe(0);
  }

  /**
   * Checks if user appears to be logged in based on UI indicators.
   */
  async isLoggedIn(): Promise<boolean> {
    try {
      const loggedOutIcon = this.page.locator('img[src="/static/icons/logged_out.svg"]');
      const isLoggedOut = await loggedOutIcon.isVisible();
      return !isLoggedOut;
    } catch {
      return false;
    }
  }

  /**
   * Logs out the current user and clears authentication state.
   */
  async logout() {
    // Check if already logged out
    if (!(await this.isLoggedIn())) {
      return;
    }

    // Find and click the user menu - look for the profile image with user initials in the banner
    const userProfile = this.page.getByRole('banner').locator('.default-profile-img');
    
    // Try to find user menu by different methods
    let userMenuClicked = false;
    
    // Method 1: Try user profile div with initials in banner
    if (await userProfile.isVisible()) {
      await userProfile.click();
      userMenuClicked = true;
    } else {
      // Method 2: Try to find user menu icon in banner
      const bannerUserMenu = this.page.getByRole('banner').locator('img').last();
      if (await bannerUserMenu.isVisible()) {
        await bannerUserMenu.click();
        userMenuClicked = true;
      }
    }
    
    if (userMenuClicked) {
      // Click logout option
      const logoutOption = this.page.locator(SELECTORS.DROPDOWN_OPTION)
        .filter({ hasText: /log out|sign out|logout/i });
      
      if (await logoutOption.isVisible()) {
        await logoutOption.click();
        await this.page.waitForLoadState('networkidle');
      }
    }
  }

  /**
   * Test both logged-in and logged-out states of a feature.
   * @param testCallback - Function to run in both states
   */
  async testWithAuthStates(
    testCallback: (isLoggedIn: boolean) => Promise<void>
  ) {
    // Test logged-out state
    if (await this.isLoggedIn()) {
      await this.logout();
    }
    await testCallback(false);

    // Test logged-in state  
    const currentUrl = this.page.url();
    const siteUrl = currentUrl.includes('voices') ? SELECTORS.LOGO.VOICES : SELECTORS.LOGO.LIBRARY;
    await this.loginWithCredentials(currentUrl.includes('voices') ? 'https://voices.modularization.cauldron.sefaria.org' : 'https://modularization.cauldron.sefaria.org', 'superUser');
    await testCallback(true);
  }

  /**
   * Tests search dropdown functionality by typing a query and validating dropdown sections.
   * Uses constants from SEARCH_DROPDOWN for consistent validation and flexible configuration.
   * @param searchTerm - The text to type in the search box (optional, defaults to comprehensive test term)
   * @param expectedSections - Array of section names that should be visible (optional, uses constants default)
   * @param unexpectedSections - Array of section names that should NOT be visible (optional, uses constants default)
   */
  async testSearchDropdown(
    searchTerm: string = SEARCH_DROPDOWN.TEST_SEARCH_TERMS.LIBRARY_SHOW_ALL, 
    expectedSections: readonly string[] = SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_SECTIONS, 
    unexpectedSections: readonly string[] = SEARCH_DROPDOWN.LIBRARY_EXCLUDED_SECTIONS
  ) {
    const searchBox = this.page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await expect(searchBox).toBeVisible();
    
    // Clear and type search term
    await searchBox.clear();
    await searchBox.fill(searchTerm);
    
    // Wait for dropdown to appear
    const dropdown = this.page.locator(SEARCH_DROPDOWN.CONTAINER);
    await expect(dropdown).toBeVisible();
    
    // Verify expected sections are present using reliable text-based search
    for (const section of expectedSections) {
      const sectionTitle = dropdown.getByText(section, { exact: true });
      await expect(sectionTitle).toBeVisible();
    }
    
    // Verify unexpected sections are NOT present using text-based search
    for (const section of unexpectedSections) {
      const sectionTitle = dropdown.getByText(section, { exact: true });
      await expect(sectionTitle).not.toBeVisible();
    }
  }

  /**
   * Tests that search dropdown sections have the correct icons using configured icon mappings.
   * Uses SEARCH_DROPDOWN constants for both icon selectors and expected icons list.
   * @param searchTerm - The text to type in the search box (optional, defaults to comprehensive test term)
   * @param expectedIcons - Array of icon alt texts that should be visible (optional, uses constants default)
   */
  async testSearchDropdownIcons(
    searchTerm: string = SEARCH_DROPDOWN.TEST_SEARCH_TERMS.LIBRARY_SHOW_ALL,
    expectedIcons: readonly string[] = SEARCH_DROPDOWN.LIBRARY_ALL_EXPECTED_ICONS
  ) {
    const searchBox = this.page.getByRole('banner').getByRole('combobox', { name: /search/i });
    await searchBox.clear();
    await searchBox.fill(searchTerm);
    
    const dropdown = this.page.locator(SEARCH_DROPDOWN.CONTAINER);
    await expect(dropdown).toBeVisible();
    
    // Check that each expected icon is present using pre-built selectors from constants
    // Use .first() to avoid strict mode violations when multiple results of same type exist
    for (const iconAlt of expectedIcons) {
      const iconConfig = this.getIconConfig(iconAlt);
      if (iconConfig) {
        // Use the pre-built selector from constants instead of manually building it
        const icon = dropdown.locator(iconConfig.selector).first();
        await expect(icon).toBeVisible();
      } else {
        throw new Error(`Icon configuration not found for alt text: ${iconAlt}`);
      }
    }
  }

  /**
   * Helper method to get icon configuration by alt text from constants.
   * @param altText - The alt text of the icon to find
   * @returns The icon configuration or null if not found
   */
  private getIconConfig(altText: string): { selector: string; alt: string } | null {
    const iconEntries = Object.values(SEARCH_DROPDOWN.ICONS);
    return iconEntries.find(icon => icon.alt === altText) || null;
  }
}