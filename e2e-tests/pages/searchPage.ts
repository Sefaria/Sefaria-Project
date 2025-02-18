import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class SearchPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    async searchFor(criteria: string){

        const searchBox = this.page.getByRole('banner').getByRole('combobox')

        await searchBox.click()
        await searchBox.fill(criteria)
        await searchBox.press('Enter')
        
        if(this.language == LANGUAGES.HE){
            await this.page.getByText('תוצאות עבור').click();
        }
        else{
            await this.page.getByPlaceholder('Search').click();
        }

        await expect(this.page.getByRole('heading').first()).toContainText(criteria)
    }

    async validateVirtualKeyboardForEnglish(character: string){
        await this.page.getByRole('banner').getByRole('combobox').click()
        await this.page.getByRole('img', { name: 'Display virtual keyboard' }).click();    
        await this.page.getByRole('cell', { name: character, exact: true }).click();
        await expect(this.page.getByRole('banner').getByRole('combobox')).toHaveValue(character)
    }
}