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

    async validateFirstLineOfContent(text: string){
        await expect(this.page.locator('div.segmentNumber').first().locator('..').locator('p')).toContainText(`${text}`)
    }

    async validateLinkExistsBanner(text: string){
        await expect(this.page.getByRole('banner')).toContainText(text)
    }
}