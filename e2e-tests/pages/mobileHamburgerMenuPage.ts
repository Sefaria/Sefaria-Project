import { Page, expect, Locator } from '@playwright/test';
import { HelperBase } from './helperBase';
import { MOBILE_SELECTORS, MOBILE_MENU_ITEMS } from '../mobile-constants';
import { MODULE_URLS } from '../constants';
import { t } from '../globals';

/**
 * Page object for mobile hamburger menu interactions
 * Handles opening/closing the menu, navigation, and verification
 */
export class MobileHamburgerMenuPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // Locators
  get hamburgerButton(): Locator {
    return this.page.locator(MOBILE_SELECTORS.HAMBURGER_BUTTON);
  }

  get mobileNavMenu(): Locator {
    return this.page.locator(MOBILE_SELECTORS.NAV_MENU);
  }

  get searchLine(): Locator {
    return this.page.locator(MOBILE_SELECTORS.SEARCH_LINE);
  }

  get headerLanguageToggle(): Locator {
    return this.page.locator(MOBILE_SELECTORS.HEADER_LANGUAGE_TOGGLE);
  }

  get mobileAccountLinks(): Locator {
    return this.page.locator(MOBILE_SELECTORS.ACCOUNT_LINKS);
  }

  // Navigation link getters
  get textsLink(): Locator {
    return this.mobileNavMenu.locator(MOBILE_SELECTORS.TEXTS_LINK).first();
  }

  get topicsLink(): Locator {
    return this.mobileNavMenu.locator(MOBILE_SELECTORS.TOPICS_LINK).first();
  }

  get calendarsLink(): Locator {
    return this.mobileNavMenu.locator(MOBILE_SELECTORS.CALENDARS_LINK);
  }

  get donateLink(): Locator {
    return this.page.locator(MOBILE_SELECTORS.DONATE_LINK);
  }

  get helpLink(): Locator {
    return this.mobileNavMenu.locator(MOBILE_SELECTORS.HELP_LINK);
  }

  get aboutLink(): Locator {
    return this.mobileNavMenu.locator(MOBILE_SELECTORS.ABOUT_LINK);
  }

  get voicesModuleSwitcher(): Locator {
    return this.page.locator('.mobileModuleSwitcher').filter({ hasText: /Voices on Sefaria/i });
  }

  get libraryModuleSwitcher(): Locator {
    return this.page.locator('.mobileModuleSwitcher').filter({ hasText: /Sefaria Library/i });
  }

  get developersLink(): Locator {
    return this.page.locator('.mobileModuleSwitcher').filter({ hasText: /Developers on Sefaria/i });
  }

  get productsLink(): Locator {
    return this.mobileNavMenu.locator(MOBILE_SELECTORS.MODULE_SWITCHER_PRODUCTS);
  }

  get libraryLogo(): Locator {
    return this.page.locator(MOBILE_SELECTORS.LOGO_LIBRARY);
  }

  get voicesLogo(): Locator {
    return this.page.locator(MOBILE_SELECTORS.LOGO_VOICES);
  }

  // Actions
  async openHamburgerMenu(): Promise<void> {
    await this.hamburgerButton.click();
    await expect(this.mobileNavMenu.first()).toBeVisible({ timeout: t(3000) });
    // Ensure menu is not in closed state
    await expect(this.mobileNavMenu.first()).not.toHaveClass(/closed/);
  }

  async closeHamburgerMenu(): Promise<void> {
    await this.hamburgerButton.click();
    await this.page.waitForTimeout(t(500)); // Wait for animation
  }

  async isMenuOpen(): Promise<boolean> {
    const isVisible = await this.mobileNavMenu.isVisible();
    const isClosed = await this.mobileNavMenu.evaluate((el) => {
      return el.classList.contains('closed');
    });
    return isVisible && !isClosed;
  }

  async switchToEnglish(): Promise<void> {
    // Click the A/א toggle in the mobile header (top right)
    const languageToggle = this.page.locator('.mobileHeaderLanguageToggle a').first();
    await languageToggle.click();
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(t(500));
  }

  async switchLanguageInMenu(targetLanguage: 'english' | 'hebrew'): Promise<void> {
    const languageToggle = this.mobileNavMenu.locator(MOBILE_SELECTORS.LANGUAGE_TOGGLE);
    await expect(languageToggle).toBeVisible();

    const targetLink = targetLanguage === 'english'
      ? languageToggle.locator(MOBILE_SELECTORS.LANGUAGE_EN)
      : languageToggle.locator(MOBILE_SELECTORS.LANGUAGE_HE);

    // Check if already active (not inactive)
    const isInactive = await targetLink.evaluate((el) => el.classList.contains('inactive'));

    if (isInactive) {
      await targetLink.click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  async searchInMenu(searchTerm: string): Promise<void> {
    const searchInput = this.searchLine.locator('input.search');
    await searchInput.fill(searchTerm);
    await this.page.waitForTimeout(t(1000)); // Wait for autocomplete dropdown
  }

  async exitSearch(): Promise<void> {
    // Click the search bar again to exit
    await this.searchLine.click();
    await this.page.waitForTimeout(t(500));
  }

  async verifySearchResultTypes(expectedTypes: readonly string[]): Promise<void> {
    const dropdown = this.page.locator('.autocomplete-dropdown');
    await expect(dropdown).toBeVisible({ timeout: t(5000) });

    for (const type of expectedTypes) {
      const typeSection = dropdown.getByText(type, { exact: true });
      await expect(typeSection).toBeVisible();
    }
  }

  async clickTexts(): Promise<void> {
    await this.textsLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickTopics(): Promise<void> {
    await this.topicsLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickDonate(): Promise<Page> {
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.donateLink.click()
    ]);
    await newPage.waitForLoadState('domcontentloaded');
    return newPage;
  }

  async clickHelp(): Promise<Page> {
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.helpLink.click()
    ]);
    await newPage.waitForLoadState('domcontentloaded');
    return newPage;
  }

  async clickAbout(): Promise<void> {
    await this.aboutLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickVoicesModuleSwitcher(): Promise<void> {
    await this.voicesModuleSwitcher.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickLibraryModuleSwitcher(): Promise<void> {
    await this.libraryModuleSwitcher.click();
    await this.page.waitForLoadState('networkidle');
  }

  async clickDevelopers(): Promise<Page> {
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.developersLink.click()
    ]);
    await newPage.waitForLoadState('networkidle');
    return newPage;
  }

  async clickMoreFromSefaria(): Promise<void> {
    await this.productsLink.click();
    await this.page.waitForLoadState('networkidle');
  }

  async goBack(): Promise<void> {
    await this.page.goBack();
    await this.page.waitForLoadState('networkidle');
  }

  // Verification methods
  async verifyHeaderArtifacts(): Promise<void> {
    // Verify hamburger button
    await expect(this.hamburgerButton).toBeVisible();

    // Verify logo (Library or Voices)
    const libraryLogoVisible = await this.libraryLogo.isVisible().catch(() => false);
    const voicesLogoVisible = await this.voicesLogo.isVisible().catch(() => false);
    expect(libraryLogoVisible || voicesLogoVisible).toBe(true);

    // Verify language toggle
    await expect(this.headerLanguageToggle).toBeVisible();
  }

  async verifyMenuArtifacts(module: 'library' | 'voices', language: 'english' | 'hebrew' = 'english'): Promise<void> {
    await expect(this.mobileNavMenu).toBeVisible();

    // Verify search bar
    await expect(this.searchLine).toBeVisible();

    // Verify module-specific items based on module type
    if (module === 'library') {
      const menuText = language === 'english'
        ? MOBILE_MENU_ITEMS.LIBRARY.EN
        : MOBILE_MENU_ITEMS.LIBRARY.HE;

      // Verify common items
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.TOPICS)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.DONATE)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.HELP)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.ABOUT)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.DEVELOPERS)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.MORE_FROM_SEFARIA)).toBeVisible();

      // Verify library-specific items
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.TEXTS)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.LEARNING_SCHEDULES)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.VOICES_ON_SEFARIA)).toBeVisible();

      // Verify login/signup section (if not logged in)
      const loginVisible = await this.page.locator('.mobileNavMenu').getByText(menuText.LOGIN).isVisible().catch(() => false);
      if (loginVisible) {
        await expect(this.page.locator('.mobileNavMenu').getByText(menuText.SIGNUP)).toBeVisible();
      }
    } else {
      const menuText = language === 'english'
        ? MOBILE_MENU_ITEMS.VOICES.EN
        : MOBILE_MENU_ITEMS.VOICES.HE;

      // Verify common items
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.TOPICS)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.DONATE)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.HELP)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.ABOUT)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.DEVELOPERS)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.MORE_FROM_SEFARIA)).toBeVisible();

      // Verify voices-specific items
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.COLLECTIONS)).toBeVisible();
      await expect(this.page.locator('.mobileNavMenu').getByText(menuText.SEFARIA_LIBRARY)).toBeVisible();

      // Verify login/signup section (if not logged in)
      const loginVisible = await this.page.locator('.mobileNavMenu').getByText(menuText.LOGIN).isVisible().catch(() => false);
      if (loginVisible) {
        await expect(this.page.locator('.mobileNavMenu').getByText(menuText.SIGNUP)).toBeVisible();
      }
    }
  }

  async verifyOnTextsPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/texts/);
    await expect(this.page.locator('.mobileNavMenu').getByText('Browse the Library')).toBeVisible();
  }

  async verifyOnTopicsPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/topics/);
    await expect(this.page.locator('.mobileNavMenu').getByText('Explore by Topic')).toBeVisible();
  }

  async verifyOnAboutPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/mobile-about-menu/);
  }

  async verifyOnProductsPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/products/);
  }

  async verifyOnLibraryModule(): Promise<void> {
    const currentUrl = this.page.url();
    expect(currentUrl).toContain(MODULE_URLS.EN.LIBRARY);
  }

  async verifyOnVoicesModule(): Promise<void> {
    const currentUrl = this.page.url();
    expect(currentUrl).toContain(MODULE_URLS.EN.VOICES);
  }

  async verifyVoicesSwitcherReplaced(): Promise<void> {
    // Verify "Voices on Sefaria" is not visible
    await expect(this.voicesModuleSwitcher).not.toBeVisible();

    // Verify "Sefaria Library" is visible instead
    await expect(this.libraryModuleSwitcher).toBeVisible();
  }
}
