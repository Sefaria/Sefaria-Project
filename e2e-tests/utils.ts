import {DEFAULT_LANGUAGE, LANGUAGES, SOURCE_LANGUAGES, testUser} from './globals'
import {BrowserContext}  from '@playwright/test';
import type { Page } from '@playwright/test';

let currentLocation: string = ''; 

const hideModals = async (page: Page) => {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '#interruptingMessageBox {display: none;}';
        document.head.appendChild(style);
    });
}


/**
 * Changes the interface language by clicking through the language menu.
 * Checks if the language is already correct before making changes.
 * 
 * @param page - The Playwright page object
 * @param language - Target language (LANGUAGES.EN or LANGUAGES.HE)
 */
export const changeLanguageIfNeeded = async (page: Page, language: string) => {
    // Check if we're already in the correct language
    const expectedElement = language === LANGUAGES.HE ? 'מקורות' : 'Texts';
    const isAlreadyCorrectLanguage = await page.getByRole('banner').getByRole('link', { name: expectedElement, exact: true }).first().isVisible();
    
    if (isAlreadyCorrectLanguage) {
        // Already in the correct language, no need to change
        return;
    }
    
    // Language change needed - click through the UI
    await page.locator('.interfaceLinks-button').click()
    if (language === LANGUAGES.EN) {
        await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
        // Wait for the language change to complete by checking for English interface text
        await page.getByRole('banner').getByRole('link', { name: 'Texts' }).waitFor({ state: 'visible' });
    } else if (language === LANGUAGES.HE) {
        await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click()
        // Wait for the language change to complete by checking for Hebrew interface text
        await page.getByRole('banner').getByRole('link', { name: 'מקורות' }).waitFor({ state: 'visible' });
    }
}

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    const page: Page = await context.newPage();
    await page.goto(url);

    await changeLanguageIfNeeded(page, language);

    return page
}

export const loginUser = async (page: Page, user=testUser, language=DEFAULT_LANGUAGE) => {
    if (!user.email || !user.password) {
        throw new Error('Missing login credentials. Please set PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD in your .env file at the project root.');
    }
    await page.goto('/login');

    await changeLanguageIfNeeded(page, language);

    await page.getByPlaceholder('Email Address').fill(user.email);
    await page.getByPlaceholder('Password').fill(user.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByRole('link', { name: 'See My Saved Texts' }).isVisible();
}


export const goToPageWithUser = async (context: BrowserContext, url: string, user=testUser) => {
    const page: Page = await context.newPage();
    await loginUser(page, user)
    await changeLanguageIfNeeded(page, DEFAULT_LANGUAGE);

    await page.goto(url);

    await hideModals(page);
    
    return page;
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
    const services = [
        {
            url: 'https://ipapi.co/json/',
            extract: (data: any) => data.country
        },
        {
            url: 'https://api.ipbase.com/v1/json/',
            extract: (data: any) => data.country_code
        }
    ];

    for (const service of services) {
        try {
            const data = await page.evaluate(async (url) => {
                const response = await fetch(url);
                return await response.json();
            }, service.url);
            
            if (data) {
                return service.extract(data);
            }
        } catch (e) {
            console.log(`Failed to get country from ${service.url}`, e);
            continue;
        }
    }
    return null;
}

export const isIsraelIp = async (page: Page) => {
    if (!currentLocation) {
        currentLocation = await getCountryByIp(page);
    }
    return currentLocation === "IL";
}