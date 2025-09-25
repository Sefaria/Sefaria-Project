import { expect, Page } from '@playwright/test';
import { hideAllModalsAndPopups } from '../utils';
import { SELECTORS, SiteConfig, TabOrderItem, SEARCH_DROPDOWN, SearchDropdownSection, SearchDropdownIcon } from './constantsMDL';

/**
 * Helper class for testing header functionality across Sefaria's modularization sites.
 * Provides reusable methods for common header interactions and validations.
 */
export class HeaderTestHelpers {
  constructor(private page: Page) {}

  /**
   * Navigates to a URL and hides all modals/popups to ensure clean test state.
   * @param url - The URL to navigate to
   */
  async navigateAndHideModals(url: string) {
    await this.page.goto(url);
    await hideAllModalsAndPopups(this.page);
  }

  /**
   * Clicks a navigation link in the banner and verifies it navigates to the expected URL.
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
    await icon.click();
  }

  /**
   * Selects an option from a dropdown menu, with support for new tab navigation.
   * @param optionText - The text content of the dropdown option to select
   * @param shouldOpenNewTab - Whether the option should open in a new tab (default: false)
   * @returns Promise<Page | null> - The new page if opened in new tab, null otherwise
   */
  async selectDropdownOption(optionText: string, shouldOpenNewTab = false) {
    const option = this.page.locator(SELECTORS.DROPDOWN_OPTION).filter({ hasText: optionText });
    
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
      await expect(element).toBeFocused();
    }
  }

  /**
   * Tests keyboard navigation through the module switcher dropdown.
   * Opens the dropdown, tabs through options, and closes with Escape key.
   */
  async testModuleSwitcherKeyboard() {
    await this.openDropdown(SELECTORS.ICONS.MODULE_SWITCHER);
    
    const libraryOption = this.page.locator(SELECTORS.DROPDOWN_OPTION).filter({ hasText: 'Library' });
    await expect(libraryOption).toBeVisible();
    
    // Tab through module options
    const moduleOptions = ['Library', 'Sheets', 'Developers'];
    for (const option of moduleOptions) {
      await this.page.keyboard.press('Tab');
      const moduleOption = this.page.locator(SELECTORS.DROPDOWN_OPTION).filter({ hasText: option });
      await expect(moduleOption).toBeFocused();
    }
    
    // Close with Escape
    await this.page.keyboard.press('Escape');
    await expect(libraryOption).not.toBeVisible();
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