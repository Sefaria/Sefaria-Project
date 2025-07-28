import { Page, expect } from "@playwright/test";
import { LANGUAGES, testUser } from "../globals";
import { HelperBase } from "./helperBase";
import { changeLanguageLoggedIn } from "../utils";

export class LoginPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }



    async loginAs( user: { email: string; password: string }) {
        if (this.language === LANGUAGES.HE) {
            await this.page.getByPlaceholder('כתובת').fill(user.email);
            await this.page.getByPlaceholder('סיסמא').fill(user.password);
            await this.page.getByRole('button', { name: 'התחברות' }).click();
        } else {
            await this.page.getByPlaceholder('Email Address').fill(user.email);
            await this.page.getByPlaceholder('Password').fill(user.password);
            await this.page.getByRole('button', { name: 'Login' }).click();
        }
        // Wait for login confirmation
       // await changeLanguageLoggedIn(this.page, this.language);
        await expect(this.page.getByRole('link', { name: 'See My Saved Texts' })).toBeVisible();
    }
    
}
