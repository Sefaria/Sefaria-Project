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
    await page.goto('/');
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

/**
 * Guide overlay testing utilities
 */

/**
 * Clear guide overlay cookie to force guide to show again
 * @param page Page object
 * @param guideType Type of guide (e.g., "editor")
 */
export const clearGuideOverlayCookie = async (page: Page, guideType: string) => {
    const cookieName = `guide_overlay_seen_${guideType}`;
    // Use Playwright's native cookie API instead of jQuery
    const cookies = await page.context().cookies();
    const targetCookie = cookies.find(cookie => cookie.name === cookieName);
    if (targetCookie) {
        await page.context().clearCookies({
            name: cookieName,
            path: "/"
        });
    }
};

/**
 * Set guide overlay cookie to simulate it having been seen
 * @param page Page object  
 * @param guideType Type of guide (e.g., "editor")
 */
export const setGuideOverlayCookie = async (page: Page, guideType: string) => {
    const cookieName = `guide_overlay_seen_${guideType}`;
    const currentDate = new Date().toISOString();
    // Calculate expiry date (20 years from now)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 20);
    
    // Get the current URL to extract domain, default to localhost if needed
    let domain: string;
    try {
        domain = new URL(page.url()).hostname;
    } catch {
        domain = 'localhost';
    }
    
    await page.context().addCookies([{
        name: cookieName,
        value: currentDate,
        path: "/",
        expires: Math.floor(expiryDate.getTime() / 1000), // Playwright expects seconds
        domain: domain
    }]);
};

/**
 * Check if guide overlay cookie exists
 * @param page Page object
 * @param guideType Type of guide (e.g., "editor") 
 * @returns boolean indicating if cookie exists
 */
export const hasGuideOverlayCookie = async (page: Page, guideType: string): Promise<boolean> => {
    const cookieName = `guide_overlay_seen_${guideType}`;
    const cookies = await page.context().cookies();
    return cookies.some(cookie => cookie.name === cookieName);
};

/**
 * Navigate to a new sheet as a logged-in user
 * @param context Browser context
 * @param user User to log in as (optional, defaults to testUser)
 * @returns Page object with new sheet loaded
 */
export const goToNewSheetWithUser = async (context: BrowserContext, user = testUser): Promise<Page> => {
    const page = await goToPageWithUser(context, '/sheets/new', user);
    await page.waitForSelector('.editorContent', { timeout: 10000 });
    return page;
};

/**
 * Simulate slow API response for guide loading by intercepting the guide API call
 * @param page Page object
 * @param delayMs Delay in milliseconds (default: 8000ms to trigger timeout)
 * @param guideType Guide type to intercept (default: "editor")
 */
export const simulateSlowGuideLoading = async (page: Page, delayMs: number = 8000, guideType: string = "editor") => {
    await page.route(`**/api/guides/${guideType}`, async (route) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        await route.continue();
    });
};

/**
 * Simulate guide API error
 * @param page Page object
 * @param guideType Guide type to intercept (default: "editor")
 */
export const simulateGuideApiError = async (page: Page, guideType: string = "editor") => {
    await page.route(`**/api/guides/${guideType}`, async (route) => {
        await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Server error' })
        });
    });
};

/**
 * Wait for guide overlay to appear and be fully loaded
 * @param page Page object
 * @param timeout Timeout in milliseconds (default: 10000)
 */
export const waitForGuideOverlay = async (page: Page, timeout: number = 10000) => {
    await page.waitForSelector('.guideOverlay', { timeout });
    await page.waitForSelector('.guideOverlayContent:not(:has(.guideOverlayLoadingCenter))', { timeout });
};

/**
 * Wait for guide overlay to disappear
 * @param page Page object
 * @param timeout Timeout in milliseconds (default: 5000)
 */
export const waitForGuideOverlayToClose = async (page: Page, timeout: number = 5000) => {
    await page.waitForSelector('.guideOverlay', { state: 'detached', timeout });
};