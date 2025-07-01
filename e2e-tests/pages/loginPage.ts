import { Page, expect } from "@playwright/test"
import { LANGUAGES } from "../globals"
import { HelperBase } from "./helperBase"

export class LoginPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    // Maybe we should go about this a better way, like with a config file that is saved to each dev's machine, rather than hard coded in test files
    // Also, this code is a refactor of utils.ts: loginUser, just with using the POM structure
    async loginAs(email: string, password: string){
        if(this.language == LANGUAGES.HE){
            await this.page.getByPlaceholder('כתובת').fill(email)
            await this.page.getByPlaceholder('סיסמא').fill(password)
            await this.page.getByRole('button', {name: 'התחברות'}).click()
            //await this.page.getByRole('link', { name: 'See My Saved Texts' }).isVisible();
        }
        else{
            await this.page.getByRole('textbox', {name: 'Email'}).fill(email)
            await this.page.getByRole('textbox', {name: 'Password'}).fill(password)
            await this.page.getByRole('button', { name: 'Login' }).click();
            await this.page.getByRole('link', { name: 'See My Saved Texts' }).isVisible();
        }
        
    }
}