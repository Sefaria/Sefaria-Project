import { Page, expect } from "@playwright/test";
import { LANGUAGES, testUser } from "../globals";
import { HelperBase } from "./helperBase";
import { changeLanguage, clickContinueWithEmail } from "../utils";

export class LoginPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    // /login lands on AuthPage's ChooseView before the email/password form
    // exists — see clickContinueWithEmail in utils.ts (shared with SignUpPage).
    async clickContinueWithEmail() {
        await clickContinueWithEmail(this.page, this.language);
    }

    async loginAs( user: { email: string; password: string }) {
        const _loginHE = async () => {
            await this.clickContinueWithEmail();
            await this.page.getByLabel('דוא״ל').fill(user.email);
            await this.page.getByLabel('סיסמה').fill(user.password);
            await this.page.getByRole('button', { name: 'התחברות' }).click();
        }
        const _loginEN = async () => {
            await this.clickContinueWithEmail();
            await this.page.getByLabel('Email Address').fill(user.email);
            await this.page.getByLabel('Password').fill(user.password);
            await this.page.getByRole('button', { name: /^Log in$/i }).click();
        }

        if (this.language === LANGUAGES.HE) {
            await _loginHE();
        } else {
            await _loginEN();
        }

        // await for the page to load after login
        await this.page.waitForLoadState('domcontentloaded');
        await changeLanguage(this.page, this.language);
    }

}
