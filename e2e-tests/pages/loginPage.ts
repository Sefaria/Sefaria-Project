import { Page, expect } from "@playwright/test";
import { LANGUAGES, testUser } from "../globals";
import { HelperBase } from "./helperBase";
import { changeLanguage } from "../utils";

export class LoginPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }



    async loginAs( user: { email: string; password: string }) {
        const _loginHE = async () => {
            await this.page.getByPlaceholder('כתובת').fill(user.email);
            await this.page.getByPlaceholder('סיסמא').fill(user.password);
            await this.page.getByRole('button', { name: 'התחברות' }).click();
        }
        const _loginEN = async () => {
            await this.page.getByPlaceholder('Email Address').fill(user.email);
            await this.page.getByPlaceholder('Password').fill(user.password);
            await this.page.getByRole('button', { name: 'Login' }).click();
        }

        if (this.language === LANGUAGES.HE) {
            _loginHE();
        } else {
            _loginEN();
        }

        // await for the page to load after login
        await this.page.waitForLoadState('networkidle');
        await changeLanguage(this.page, this.language);
    }
    
}
