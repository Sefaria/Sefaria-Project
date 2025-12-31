import { Page, expect } from "@playwright/test"
import { LANGUAGES, SOURCE_LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class SourceTextPage extends HelperBase {
    constructor(page: Page, language: string) {
        super(page, language)
    }

    async setContentLanguage(mode: RegExp) {
        await this.page.getByRole('button', { name: 'Toggle Reader Menu Display Settings' }).click();
        await this.page.getByRole('radio', { name: mode }).click();
    }

    // Refactored from utils.ts: changeLanguageOfText
    async changeTextLanguage(sourceLanguage: RegExp) {
        // Clicking on the Source Language toggle
        await this.page.getByAltText('Toggle Reader Menu Display Settings').click()

        // Selecting Source Language
        await this.page.locator('div').filter({ hasText: sourceLanguage }).click()
    }

    async goToTranslations() {
        const sheetTitle = this.page.locator('h1')
        await sheetTitle.click()

        if (this.language === LANGUAGES.HE) {
            await this.page.getByRole('link', { name: 'תרגומים' }).click()
        }
        else {
            await this.page.getByRole('link', { name: 'Translations' }).click()
        }
    }

    async selectTranslation(translation: string) {

        const translationNameInSourceSheetTitle = this.page.locator('span.readerTextVersion')

        // Find the translation to select
        const translationVersionTitle = this.page.locator('div.version-with-preview-title-line', { hasText: translation })

        // Select the translation by clicking the selection button
        if (this.language === LANGUAGES.HE) {
            await translationVersionTitle.getByText('בחירה').click()
        }
        else {
            await translationVersionTitle.getByText('Select').click()
        }

        // Validate selected translation is reflected in title
        await expect(translationNameInSourceSheetTitle).toHaveText(translation)

    }

    // Opens the ToC sidebar
    async openTableOfContents() {
        await this.page.getByRole('link', { name: 'Table of Contents' }).click();
    }

    async validateFirstLineOfContent(text: string) {
        const firstLineInSourceSheet = this.page.locator('div.segmentNumber').first().locator('..').locator('p')
        await expect(firstLineInSourceSheet).toContainText(text)
    }

    async validateLinkExistsInBanner(text: string) {
        await expect(this.page.getByRole('banner')).toContainText(text)
    }

    async clickSegment(ref: string) {
        const segment = this.page.locator(`div.segment[data-ref="${ref}"]`);
        await expect(segment).toBeVisible();
        await segment.click();
    }


    async clickFilterCategory(categoryName: string) {
        await this.page.getByRole("button", { name: categoryName }).click();
    }

    async clickTextFilter(textFilter: string) {
        await this.page.getByRole("button", { name: textFilter }).click();
    }

    async expectResourcePanelToContain(text: string) {
        const panel = this.page.locator(".resource-panel");
        await expect(panel.getByText(text)).toBeVisible();
    }

    /**
     * Add the current source segment to a sheet via the connections panel
     * @param sheetTitle - The title of the sheet to add the source to
     */
    async addToSheetViaConnectionsPanel(sheetTitle: string) {
        // Click "Add to Sheet" button in connections panel
        const addButton = this.page.getByText('Add to Sheet')
        await addButton.click();

        const addToSheetButton = this.page.locator('.addToSourceSheetBox .dropdown .sefaria-common-button')
        await addToSheetButton.click();
        await this.page.waitForTimeout(500); // Wait for dropdown to appear

        // Select sheet from dropdown by title
        const sheetOption = this.page.locator('.dropdownOption')
            .filter({ hasText: sheetTitle });
        await sheetOption.first().click();
        await this.page.waitForTimeout(300);

        // Click final "Add to Sheet" button to confirm
        const addButton2 = this.page.getByText('Add to Sheet')
        await addButton2.click();
        await this.page.waitForLoadState('networkidle');
        await expect(this.page.getByText(`has been added to ${sheetTitle}`)).toBeVisible();
    }

}