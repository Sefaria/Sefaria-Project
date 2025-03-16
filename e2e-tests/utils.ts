import {DEFAULT_LANGUAGE, LANGUAGES, SOURCE_LANGUAGES, testUser} from './globals'
import {BrowserContext}  from 'playwright-core';
import type { Page } from 'playwright-core';

let langCookies: any = [];
let loginCookies: any = [];

const hideModals = async (page: Page) => {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '#interruptingMessageBox {display: none;}';
        document.head.appendChild(style);
    });
}

export const changeLanguage = async (page: Page, language: string) => {
    await page.locator('.interfaceLinks-button').click()
    if (language === LANGUAGES.EN) {
        await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
    } else if (language === LANGUAGES.HE) {
        await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click()
    }
}

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    // If a cookie already has contents, clear it so that the language cookie can be reset
    if (langCookies.length) {
        await context.clearCookies()
    }   
    const page: Page = await context.newPage();
    await page.goto('');
    await changeLanguage(page, language);
    langCookies = await context.cookies();
    await context.addCookies(langCookies);
    
    // this is a hack to get the cookie to work
    const newPage: Page = await context.newPage();
    await newPage.goto(url);
    await hideModals(newPage);
    return newPage;
}


export const loginUser = async (page: Page, user=testUser, language=DEFAULT_LANGUAGE) => {
    await page.goto('/login');
    await changeLanguage(page, language);
    await page.getByPlaceholder('Email Address').fill(user.email);
    await page.getByPlaceholder('Password').fill(user.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByRole('link', { name: 'See My Saved Texts' }).isVisible();
}


export const goToPageWithUser = async (context: BrowserContext, url: string, user=testUser) => {
    if (!loginCookies.length) {
        const page: Page = await context.newPage();
        await loginUser(page, user)
        loginCookies = await context.cookies();
    }
    await context.addCookies(loginCookies);
    // this is a hack to get the cookie to work
    const newPage: Page = await context.newPage();
    await newPage.goto(url);
    await hideModals(newPage);
    return newPage;
}

export const getPathAndParams = (url: string) => {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
}

export const changeLanguageOfText = async (page: Page, sourceLanguage: RegExp) => {
    // Clicking on the Source Language toggle
    await page.getByAltText('Toggle Reader Menu Display Settings').click()

    // Selecting Source Language
    await page.locator('div').filter({ hasText: sourceLanguage }).click()
}

export const getCountryByIp = async (page: Page) => {
    const data = await page.evaluate(() => {
        return fetch('https://ipapi.co/json/')
            .then(response => response.json())
            .then(data => data)
    })
    return data.country;
}

export const isIsraelIp = async (page: Page) => {
    const country = await getCountryByIp(page);
    return country === "IL";
}