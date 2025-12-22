import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class DonatePage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    async selectDonationFrequencyAndAmount(frequency: 'One-time'|'Monthly'|'פעם אחת'|'פעם בחודש', amount='180'){
        await this.page.getByRole('radio', {name: frequency}).click()
        await this.page.getByRole('radio', {name: amount}).click()
    }
    
}