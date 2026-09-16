import { Page, expect } from "@playwright/test";
import { LANGUAGES, t, testUser } from "../globals";
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

        // The auth form posts via XHR and re-renders in place, so the browser can
        // still be sitting on /login with no navigation pending when the click
        // resolves — waitForLoadState() returns immediately in that state. Gate on
        // the session cookie so callers (and changeLanguage's navigation below,
        // which would otherwise cancel the in-flight POST) only run once the
        // server has actually issued a session.
        await this.waitForSession();

        await changeLanguage(this.page, this.language);
    }

    /** Poll until the login POST has issued a `sessionid` cookie. */
    private async waitForSession(timeoutMs: number = t(30000)) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const cookies = await this.page.context().cookies();
            if (cookies.some(c => c.name === 'sessionid' && c.value)) return;
            await this.page.waitForTimeout(250);
        }
        throw new Error(
            `Login did not produce a 'sessionid' cookie within ${timeoutMs}ms ` +
            `(URL: ${this.page.url()}). The credentials were rejected or the form never submitted.`
        );
    }

}
