import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class SourceTextPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    // Refactored from utils.ts: changeLanguageOfText
    async changeTextLanguage(sourceLanguage: RegExp){
        // Clicking on the Source Language toggle
        await this.page.getByAltText('Toggle Reader Menu Display Settings').click()
    
        // Selecting Source Language
        await this.page.locator('div').filter({ hasText: sourceLanguage }).click()
    }

    async setContentLanguage(mode: "Source" | "Translation" | "Source with Translation") {
        await this.page.getByAltText('Toggle Reader Menu Display Settings').click()
        await this.page.getByRole('radio', { name: mode, exact: true }).click();
       // await this.page.locator('.show-source-translation-buttons').getByLabel(mode).click();
      }
      

    async goToTranslations(){
        const sheetTitle = this.page.locator('h1')
        await sheetTitle.click()

        if(this.language === LANGUAGES.HE){
            await this.page.getByRole('link', {name: 'תרגומים'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'Translations'}).click()
        }
    }

    async selectTranslation(translation: string){
        
        const translationNameInSourceSheetTitle = this.page.locator('span.readerTextVersion')
        
        // Validate currently selected translation for English
        // NOTE: We are skipping checking for the default Hebrew translation here, as it is always Masoretic
        if(this.language === LANGUAGES.EN){
            const defaultEnglishTranslation = (await translationNameInSourceSheetTitle.textContent())!
            const translationInSideBar = this.page.locator('div.version-with-preview-title-line', {hasText: defaultEnglishTranslation})
            await expect(translationInSideBar.getByRole('link')).toHaveText('Currently Selected')
        }

        // "Select" another translation.
        const translationVersionTitle = this.page.locator('div.version-with-preview-title-line', {hasText: translation})

        // Select the new translation and validate that it is "Currently Selected"
        if(this.language === LANGUAGES.HE){
            await translationVersionTitle.getByText('בחירה').click()
            await expect(translationVersionTitle.getByRole('link')).toHaveText('נוכחי')
        }
        else{
            await translationVersionTitle.getByText('Select').click()
            await expect(translationVersionTitle.getByRole('link')).toHaveText('Currently Selected')
        }

        // Validate selected translation is reflected in title
        await expect(translationNameInSourceSheetTitle).toHaveText(translation)

    }
    
    // Opens the ToC sidebar
    async openTableOfContents() {
        await this.page.getByRole('link', { name: 'Table of Contents' }).click();
    }
    
    async getTOCTitles(): Promise<string[]> {
        const tocNodes = this.page.locator('.schema-node-toc');
        return await tocNodes.evaluateAll(nodes =>
          nodes
            .map(node => {
              const title = node.querySelector('.schema-node-title .contentSpan.en')?.textContent?.trim() || '';
              // Ignore titles that are just digits (e.g., "1", "2", "3") unless meaningful
              return /^\d+$/.test(title) ? '' : title;
            })
            .filter(Boolean) // remove empty strings
        );
      }
      
      
    async validateFirstLineOfContent(text: string){
        const firstLineInSourceSheet = this.page.locator('div.segmentNumber').first().locator('..').locator('p')
        await expect(firstLineInSourceSheet).toContainText(text)
    }

    async validateLinkExistsInBanner(text: string){
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
    
}