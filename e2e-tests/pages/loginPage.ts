import { Page, expect } from "@playwright/test";
import { LANGUAGES } from "../globals";
import { HelperBase } from "./helperBase";

export class LoginPage extends HelperBase{
    constructor(page: Page, language: string){
        super(page, language)
    }

    public async ensureLanguage(language: string) {
        const currentURL = this.page.url();
        const langMenuButton = this.page.locator('a.interfaceLinks-button >> img[alt*="שפת ממשק"]');
    
        if (await langMenuButton.isVisible()) {
            await langMenuButton.click();
    
            const englishOption = this.page.locator('a.interfaceLinks-option.int-en');
            const hebrewOption = this.page.locator('a.interfaceLinks-option.int-he');
    
            if (language === LANGUAGES.EN && await englishOption.isVisible()) {
                await englishOption.click();
            } else if (language === LANGUAGES.HE && await hebrewOption.isVisible()) {
                await hebrewOption.click();
            }
    
            // Wait for redirection and page load
            await this.page.waitForURL(/sefaria\.org.*login.*/);
            //await this.page.waitForLoadState('networkidle');
        }
    }
    

    async loginAs(email: string, password: string) {
        if (this.language === LANGUAGES.HE) {
            await this.page.waitForSelector('[placeholder="כתובת"]');
            await this.page.getByPlaceholder('כתובת').fill(email);
            await this.page.waitForSelector('[placeholder="סיסמא"]');
            await this.page.getByPlaceholder('סיסמא').fill(password);
            await this.page.getByRole('button', { name: 'התחברות' }).click();
        } else {
            await this.page.waitForSelector('[placeholder="Email Address"]');
            await this.page.getByPlaceholder('Email Address').fill(email);
            await this.page.waitForSelector('[placeholder="Password"]');
            await this.page.getByPlaceholder('Password').fill(password);
            await this.page.getByRole('button', { name: 'Login' }).click();
        }
    
        // Wait for login confirmation - try multiple possible indicators
        try {
            // Try the "See My Saved Texts" link first (may not exist in all environments)
            await this.page.getByRole('link', { name: 'See My Saved Texts' }).waitFor({ timeout: 5000 });
        } catch (e) {
            // Fallback: wait for navigation away from login page and network idle
            await this.page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 });
            await this.page.waitForLoadState('networkidle');
        }
    }
    
}
