import { Page, expect } from "@playwright/test";
import { LANGUAGES } from "../globals";
import { HelperBase } from "./helperBase";

/**
 * Page Object Model for interacting with the Texts page.
 * Provides methods to navigate sections, toggle language settings, and verify text visibility.
 */
export class TextsPage extends HelperBase {
  /**
   * Constructs the TextsPage object.
   * @param page - The Playwright page instance.
   * @param language - The current language setting (e.g., 'English', 'Hebrew').
   */
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /**
   * Navigate to a specific section of the texts page.
   * @param section - The section to navigate to (e.g., 'Job', 'Genesis').
   * @param scrollIntoView - Optional parameter to scroll the element into view before clicking. Defaults to false.
   * This method uses the current language setting to determine which link to click.
   * It verifies that the URL contains the section name after navigation.
   */
  async navigateToSection(section: { he: string; en: string }, scrollIntoView: boolean = false) {
    
    // Determine the section name based on the current language setting
    const sectionName = this.language === LANGUAGES.HE ? section.he : section.en;
    const sectionLink = this.page.getByRole('link', { name: sectionName, exact: true });

    if (scrollIntoView) {
      await sectionLink.scrollIntoViewIfNeeded();
    }

    await sectionLink.click();

    // Verify navigation
    await expect(this.getPathAndParams()).toContain(`/${section.en}`);
  }
  
  /**
   * Navigates to a specific chapter in the table of contents.
   * @param chapterNumber - The chapter number to navigate to (e.g., '1', '2', '3').
   * This method uses strict selectors to locate the chapter link and verifies navigation.
   */
  async navigateToChapter(chapterNumber: { he: string; en: string }): Promise<void> {
    // Determine the chapter number based on the current language setting
    const chapterNumberText = this.language === LANGUAGES.HE ? chapterNumber.he : chapterNumber.en;

    // Locate the chapter by its chapter name and link
    const chapterLocator = this.page.getByRole('link', { name: chapterNumberText, exact: true }).first();
    await chapterLocator.scrollIntoViewIfNeeded();
    await chapterLocator.click();

    // Verify navigation
    await expect(this.getPathAndParams()).toContain(`.${chapterNumber.en}`);
  }

  /**
   * Ensures that the correct translation version is displayed in the Reader.
   * @param expectedVersion - The expected translation version (e.g., 'JPS, 1985').
   */
  async ensureTranslationVersion(expectedVersion: string): Promise<void> {
    // Locate the translation version element
    const translationVersionLocator = this.page.locator('.readerTextVersion .en').first();

    // Verify that the translation version matches the expected version
    await expect(translationVersionLocator).toHaveText(expectedVersion, { timeout: 5000 });
  }




  /**
   * Clicks the Tanakh link based on the current language setting.
   * Verifies that the URL contains '/Tanakh' after navigation.
   */
  async clickTanakh() {
    const tanakhName = {
      'he': 'תנ"ך',
      'en': 'Tanakh'
    }
    await this.navigateToSection(tanakhName);
   
  }


  /**
   * Opens the dropdown button for language selection.
   */
  async openTextDisplayOptions() {
    const dropdownButton = this.page.locator('.dropdownButton .readerOptionsTooltip');
    await dropdownButton.scrollIntoViewIfNeeded();
    await expect(dropdownButton).toBeVisible();
    await dropdownButton.click();
  }
  /**
   * Toggles the language setting in the Reader.
   * Maps the language options to the updated dropdown element.
   * @param language - The language to toggle to ('Hebrew', 'English', 'Bilingual').
   */
  async toggleLanguage(language: 'Hebrew' | 'English' | 'Bilingual') {
    await this.openTextDisplayOptions();

    let languageOption: string;
    if (language === 'Hebrew') {
      languageOption = 'Source';
    } else if (language === 'English') {
      languageOption = 'Translation';
    } else if (language === 'Bilingual') {
      languageOption = 'Source with Translation';
    } else {
      throw new Error(`Invalid language option: ${language}`);
    }

    const languageRadioButton = this.page.locator(`input[value="${languageOption}"]`);
    await languageRadioButton.click();
  }

  /**
   * Verifies the visibility of text based on the current language setting.
   * @param language - The language to verify ('Hebrew', 'English', 'Bilingual').
   * @param expectedTexts - An object containing the expected Hebrew and English text.
   */
  async verifyTextVisibility(language: 'Hebrew' | 'English' | 'Bilingual', expectedTexts: { he: string; en: string }) {
    // Locate the first segment text within the first text range
    const hebrewTextLocator = this.page.locator('.textRange.basetext .segmentText .contentSpan.he.primary').first();
    const englishTextLocator = this.page.locator('.textRange.basetext .segmentText .contentSpan.en.translation').first();

    if (language === 'Hebrew') {
      await expect(hebrewTextLocator).toHaveText(expectedTexts.he, { timeout: 5000 });
      await expect(englishTextLocator).not.toBeVisible();
    } else if (language === 'English') {
      await expect(englishTextLocator).toHaveText(expectedTexts.en, { timeout: 5000 });
      await expect(hebrewTextLocator).not.toBeVisible();
    } else if (language === 'Bilingual') {
      await expect(hebrewTextLocator).toHaveText(expectedTexts.he, { timeout: 5000 });
      await expect(englishTextLocator).toHaveText(expectedTexts.en, { timeout: 5000 });
    }
  }




}