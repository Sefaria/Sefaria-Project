import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class TextsPage extends HelperBase{

    constructor(page: Page, language){
        super(page, language)
    }

    async clickTanakh(){
        if(this.language == LANGUAGES.HE){
            await this.page.getByRole('link', {name: 'תנ"ך'}).click()
        }
        else{
            await this.page.getByRole('link', {name: 'Tanakh'}).click()
        }

        expect(this.getPathAndParams()).toContain('/Tanakh')
    }
}