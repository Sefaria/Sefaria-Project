import {DEFAULT_LANGUAGE, LANGUAGES, cookieObject} from './globals'
import {BrowserContext}  from 'playwright-core';
import type { Page } from 'playwright-core';

export const changeLanguage = async (page: any, language: string) => {
    await page.locator('.interfaceLinks-button').click()
    if (language === LANGUAGES.EN) {
        await page.getByRole('banner').getByRole('link', { name: 'English' }).click()
    } else if (language === LANGUAGES.HE) {
        await page.getByRole('banner').getByRole('link', { name: ' עברית' }).click()
    }
}

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    const page: Page = await context.newPage();
    await page.goto('');
    await changeLanguage(page, language);
    // this is a hack to get the cookie to work
    const newPage: Page = await context.newPage();
    await newPage.goto(url);
    return newPage;
}
