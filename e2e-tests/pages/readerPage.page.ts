import { Page, expect } from "@playwright/test";
import { LANGUAGES } from "../globals";
import { HelperBase } from "./helperBase";

/**
 * Page Object Model for interacting with the Specific books after navigating to the Texts page.
 * Provides methods to navigate sections, toggle language settings, and verify text visibility.
 * Example: Perform actions on Jobs chapter 1 after navigating to it (url: /Job1.1)
 */
export class ReaderPage extends HelperBase {
  /**
   * Constructs the ReaderPage object.
   * @param page - The Playwright page instance.
   * @param language - The current language setting (e.g., 'English', 'Hebrew').
   */
  constructor(page: Page, language: string) {
    super(page, language);
  }


  // ||< NAVIGATION METHODS >|| 
  // for /texts page and when inside a specific section of Jewish Canon 
  // (e.g,. Tanakh, Talmud)

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


  // ||< READER HEADER METHODS >||

  // Locator for the text display options dropdown in the Reader (the 'A' Button)
  textDisplayOptionsLocator = () => this.page.locator('.dropdownButton .readerOptionsTooltip');

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
   * Opens the text display options dropdown in the Reader. (the 'A' Button)
   */
  async toggleTextDisplayOptions() {
    const dropdownButton = this.textDisplayOptionsLocator();
    await dropdownButton.scrollIntoViewIfNeeded();
    await expect(dropdownButton).toBeVisible();
    await dropdownButton.click();
  }


  // ||< LANGUAGE TOGGLE METHODS >||

  // Locators for Hebrew and English text in the Reader (the first one in the text range)
  hebrewTextLocatorFirst = () => this.page.locator('.textRange.basetext .segmentText .contentSpan.he.primary').first();
  englishTextLocatorFirst = () => this.page.locator('.textRange.basetext .segmentText .contentSpan.en.translation').first();

  /**
   * Toggles the language setting in the Reader.
   * Maps the language options to the updated dropdown element.
   * @param language - The language to toggle to ('Hebrew', 'English', 'Bilingual').
   */
  async toggleLanguage(language: 'Hebrew' | 'English' | 'Bilingual') {
    await this.toggleTextDisplayOptions();

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

  // Helper methods to compare Hebrew and English text in the Reader
  /**
   * Compares the Hebrew text in the Reader with the expected text.
   * @param expectedText - The expected Hebrew text to compare against.
   */
  async compareHebrewText(expectedText: string) {
    const hebrewTextLocatorFirst = this.hebrewTextLocatorFirst();
    await expect(hebrewTextLocatorFirst).toHaveText(expectedText, { timeout: 5000 });
  }
  /**
   * Compares the English text in the Reader with the expected text.
   * @param expectedText - The expected English text to compare against.
   */
  async compareEnglishText(expectedText: string) {
    const englishTextLocatorFirst = this.englishTextLocatorFirst();
    await expect(englishTextLocatorFirst).toHaveText(expectedText, { timeout: 5000 });
  }


  /**
   * Verifies the visibility of text based on the current language setting.
   * @param language - The language to verify ('Hebrew', 'English', 'Bilingual').
   * @param expectedTexts - An object containing the expected Hebrew and English text.
   */
  async verifyTextVisibility(language: 'Hebrew' | 'English' | 'Bilingual', expectedTexts: { he: string; en: string }) {
    const hebrewTextLocatorFirst = this.hebrewTextLocatorFirst();
    const englishTextLocatorFirst = this.englishTextLocatorFirst();
    
    if (language === 'Hebrew') {
      await this.compareHebrewText(expectedTexts.he);
      await expect(englishTextLocatorFirst).not.toBeVisible();
    } else if (language === 'English') {
      await this.compareEnglishText(expectedTexts.en);
      await expect(hebrewTextLocatorFirst).not.toBeVisible();
    } else if (language === 'Bilingual') {
      await this.compareHebrewText(expectedTexts.he);
      await this.compareEnglishText(expectedTexts.en);
    }
  }


  // ||< FONT SIZE ADJUSTMENT METHODS >||

  // Locators for font size adjustment buttons in the Reader
  buttonSelectorDecreaseFont = () => this.page.locator('.font-size-line').getByRole('button').nth(0);
  buttonSelectorIncreaseFont = () => this.page.locator('.font-size-line').getByRole('button').nth(1);

  /**
   * Adjusts the font size in the Reader by either increasing or decreasing it.
   * This method locates the font size adjustment buttons within the dropdown and clicks the appropriate button.
   * @param action - The action to perform ('increase' or 'decrease').
   * @param clickAmount - The number of times to click the button (default is 1).
   */
  async adjustFontSize(action: 'increase' | 'decrease', clickAmount: number = 1): Promise<void> {
    // Open the text display options dropdown
    await this.toggleTextDisplayOptions();

    // Determine the button to click based on the action
    const fontSizeButton = action === 'increase' 
      ? this.buttonSelectorIncreaseFont() 
      : this.buttonSelectorDecreaseFont();

    // Ensure the button is visible and clickable
    await expect(fontSizeButton).toBeVisible();


    // Click the appropriate button the clickAmount of times
    for (let i = 0; i < clickAmount; i++) {
      await fontSizeButton.click();
    }

    // Close the text display options dropdown
    // This is done to ensure the font size change is applied and the dropdown is closed
    // This is necessary to avoid any issues with the dropdown remaining open during subsequent actions
    await this.toggleTextDisplayOptions();
  }

  /**
   * Retrieves the font size of the text in the Reader for both Hebrew and English.
   * This method uses the locators for the first Hebrew and English text segments and extracts their font size.
   * @returns An object containing the font sizes for Hebrew and English text.
   */
  async getFontSizes(): Promise<{ hebrewFontSize: string; englishFontSize: string }> {
    // Locate the first Hebrew text segment and retrieve its font size
    const hebrewTextLocatorFirst = this.hebrewTextLocatorFirst();
    const hebrewFontSize = await hebrewTextLocatorFirst.evaluate((element) => {
      return window.getComputedStyle(element).fontSize;
    });

    // Locate the first English text segment and retrieve its font size
    const englishTextLocatorFirst = this.englishTextLocatorFirst();
    const englishFontSize = await englishTextLocatorFirst.evaluate((element) => {
      return window.getComputedStyle(element).fontSize;
    });

    // Return the font sizes for both Hebrew and English text
    return { hebrewFontSize, englishFontSize };
  }

  /**
   * Verifies that the font size has changed correctly for both Hebrew and English texts.
   * Compares the initial and updated font sizes to ensure the change matches expectations.
   * @param initialFontSizes - An object containing the initial font sizes for Hebrew and English texts.
   * @param updatedFontSizes - An object containing the updated font sizes for Hebrew and English texts.
   * @param action - The action performed ('increase' or 'decrease').
   */
  async verifyFontSizeChange(
    initialFontSizes: { hebrewFontSize: string; englishFontSize: string },
    updatedFontSizes: { hebrewFontSize: string; englishFontSize: string },
    action: 'increase' | 'decrease'
  ): Promise<void> {

    // Convert font sizes to numeric values for comparison
    const initialHebrewFontSize = parseFloat(initialFontSizes.hebrewFontSize);
    const updatedHebrewFontSize = parseFloat(updatedFontSizes.hebrewFontSize);
    const initialEnglishFontSize = parseFloat(initialFontSizes.englishFontSize);
    const updatedEnglishFontSize = parseFloat(updatedFontSizes.englishFontSize);

    if (action === 'increase') {
      // Font sizes should increase
      expect(updatedHebrewFontSize).toBeGreaterThan(initialHebrewFontSize);
      expect(updatedEnglishFontSize).toBeGreaterThan(initialEnglishFontSize);
    } else if (action === 'decrease') {
      // Font sizes should decrease
      expect(updatedHebrewFontSize).toBeLessThan(initialHebrewFontSize);
      expect(updatedEnglishFontSize).toBeLessThan(initialEnglishFontSize);
    } else {
      throw new Error(`Invalid action: ${action}`);
    }
  }


  // ||< HEBREW VOCALIZATION TOGGLE METHODS >||

  // Locators for Hebrew vocalization toggles in the Reader
  vowelsToggleLocator = () => this.page.locator('label.toggle-switch-label[for="vowels0"]');
  cantillationToggleLocator = () => this.page.locator('label.toggle-switch-label[for="cantillation0"]');
  
  /**
   * Toggles the Hebrew vocalization settings in the Reader.
  * This method interacts with the toggle switches for vowels and cantillation in the text properties menu.
  * @param option - The vocalization option to toggle ('none', 'vowels', or 'all').
  */
  async toggleHebrewVocalization(option: 'none' | 'vowels' | 'all'): Promise<void> {
    // Open the text display options dropdown
    await this.toggleTextDisplayOptions();

    const dropdownButton = this.textDisplayOptionsLocator();
    await expect(dropdownButton).toBeVisible();

    // Locate the toggle switches for vowels and cantillation
    const vowelsToggle = this.vowelsToggleLocator();
    const cantillationToggle = this.cantillationToggleLocator();
    await expect(vowelsToggle).toBeVisible();
    await expect(cantillationToggle).toBeVisible();

    // Perform the toggle action based on the selected option

    // Turn off both vowels and cantillation (turning off vowels turns off both)
    if (option === 'none') {
      await vowelsToggle.setChecked(false, { force: true });
    } 
    // Turn on vowels 
    else if (option === 'vowels') {
      await vowelsToggle.setChecked(true, { force: true });
    } 
    // Turn on both vowels and cantillation
    else if (option === 'all') {
      if (!(await vowelsToggle.isChecked())) {
        await vowelsToggle.click({force: true});
        // Reopen up the text display options to ensure cantillation toggle is visible
        await this.toggleTextDisplayOptions();
      }
      await cantillationToggle.setChecked(true, { force: true }); 
    } else {
      throw new Error(`Invalid vocalization option: ${option}`);
    }
  }


  // ||< Layout Methods >||

  /**
   * Sets the bilingual layout in the Reader.
   * This method opens the text display options dropdown and selects the specified layout
   * @param layout - The layout to set ('stacked', 'heLeft', or 'heRight').
   */
  async setBilingualLayout(layout: 'stacked' | 'heLeft' | 'heRight') {
    // Open the text display options dropdown
    await this.toggleTextDisplayOptions();

    // Determine the radio button locator based on the layout option
    const layoutRadioButton = this.page.locator(`input[name="layout-options"][value="${layout}"]`);

    // Ensure the radio button is visible
    await expect(layoutRadioButton).toBeVisible();

    // Click the radio button to select the layout
    await layoutRadioButton.click();
  }
    

  /**
   * Verifies the bilingual layout in the Reader.
   * This method checks if the specified layout class is present in the reader panel
   * and ensures the layout is visible.
   * @param layout - The layout to verify ('stacked', 'heLeft', or 'heRight').
   */

  async verifyBilingualLayout(layout: 'stacked' | 'heLeft' | 'heRight') {
    // Locator to find div that contains texts (identifies layout)
    const layoutLocator = this.page.locator(`#panelWrapBox .${layout}`);


    // Verify the layout class is present
    const classList = await layoutLocator.getAttribute('class');
    expect(classList).toContain(layout);

    // TODO - Find a visual way of confirming the switches (like how it changes sides)
  }







}