import {DEFAULT_LANGUAGE, LANGUAGES, testUser} from './globals'
import {BrowserContext}  from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, Locator } from '@playwright/test';
import { LoginPage } from './pages/loginPage';
import path from 'path';
import fs from 'fs';

let currentLocation: string = '';
const AUTH_FILE = path.join(__dirname, 'auth.json');
// delete AUTH_FILE if it exists to reset the auth state
if (fs.existsSync(AUTH_FILE)) {
  fs.unlinkSync(AUTH_FILE);
}


/**
 * Gets the path to a test fixture file
 * @param fixtureName - Name of the fixture file (e.g., 'test-image.jpg')
 * @returns Absolute path to the fixture file
 */
export const getFixturePath = (fixtureName: string): string => {
  return path.join(__dirname, 'fixtures', fixtureName);
};

/**
 * Gets the path to a test image for upload testing
 * @param imageName - Name of the image file (defaults to 'test-image.jpg')
 * @returns Absolute path to the test image
 */
export const getTestImagePath = (imageName: string = 'test-image.jpg'): string => {
  return getFixturePath(imageName);
};

/*METHODS TO HIDE MODALS/POPUPS THAT INTERRUPT THE USER EXPERIENCE */

/**Note, for all of these miding/dismiss methods, we currently use CSS to hide them
 * We may want to opt for a more robust solution in the future, or something user-realistic such as 
 * clicking an "x" or "okay" button,but this is a workaround for now.
 * 
 * They are all exports in the case that they will be used individually in tests outside this file, 
 * rather than only calling hideAllModalsAndPopups()
*/

const updateStorageState = async (storageState: any, key: string, value: any) => {
  // Modify the cookies as needed
  storageState.cookies = storageState.cookies.map(cookie => {
    if (cookie.name === key) {
      return { ...cookie, value: value };
    }
    return cookie;
  });
  return storageState.cookies;
}

// Dismisses the main modal interrupting message by clicking close button or injecting CSS to hide it.
export const hideModals = async (page: Page) => {
    //await page.waitForLoadState('networkidle'); 
      try {
        const closeButton = page.locator('#interruptingMessageClose');
        if (await closeButton.isVisible({ timeout: 2000 })) {
            await closeButton.click();
            return;
        }
    } catch (error) {
    }
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '#interruptingMessageBox, #interruptingMessageOverlay, #interruptingMessage {display: none !important;}';
        document.head.appendChild(style); 
    });
}

export const hideTipsAndTricks = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    // Hide the tips and tricks overlay
    style.innerHTML = `
      .guideOverlay {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  });
};

//try clicking the close button, else hide the modal and overlay forcibly
export const hideExploreTopicsModal = async (page: Page) => {
  await page.evaluate(() => {
    const closeBtn = document.querySelector('.ub-emb-close');
    if (closeBtn) {
      (closeBtn as HTMLElement).click();
    } else {
      const modal = document.querySelector('.ub-emb-iframe-wrapper');
      if (modal) {
        (modal as HTMLElement).style.display = 'none';
        (modal as HTMLElement).style.visibility = 'hidden';
        (modal as HTMLElement).style.pointerEvents = 'none';
      }
      const iframe = document.querySelector('.ub-emb-iframe');
      if (iframe) {
        (iframe as HTMLElement).style.display = 'none';
        (iframe as HTMLElement).style.visibility = 'hidden';
        (iframe as HTMLElement).style.pointerEvents = 'none';
      }
    }
  });
}

export const dismissNewsletterPopupIfPresent = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    // Hide all known newsletter popup elements and overlays; !important ensures they are not shown
    style.innerHTML = `
      .ub-emb-scroll-wrapper,
      .ub-emb-iframe-wrapper,
      .ub-emb-iframe,
      iframe[src*="ubembed.com"],
      .ub-emb-close,
      div[class*="ub-emb"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important; // Prevents interaction with hidden elements
      }
    `;
    document.head.appendChild(style);
  });
};

//method to hide Welcome to New Editor banner
export const hideGenericBanner = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .genericBanner {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  });
};

export const hideCookiesPopup = async (page: Page) => {
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        .cookiesNotification {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
    });
  };
  
export const hideTopBanner = async (page: Page) => {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .readerControlsOuter {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  });
};

/**
 * Hides all common popups, modals, and banners that might interfere with tests
 * This is called automatically by navigation functions but can also be called manually
 */
export const hideAllModalsAndPopups = async (page: Page) => {
  await hideModals(page);
  await dismissNewsletterPopupIfPresent(page);
  await hideGenericBanner(page);
  await hideCookiesPopup(page);
  await hideExploreTopicsModal(page);
  await hideTipsAndTricks(page);
};

/**
 *language change function with multiple fallback strategies
 * 
 * @param page - The Playwright page object
 * @param language - Target language (LANGUAGES.EN or LANGUAGES.HE)
 */
export const changeLanguage = async (page: Page, language: string) => {
  await toggleLanguage(page, language)

  if (!fs.existsSync(AUTH_FILE)) {
    await toggleLanguage(page, language)
    return;
  }
  await page.context().storageState({ path: AUTH_FILE });
  await updateStorageState(await page.context().storageState(), 'interfaceLang', language);
};


export const toggleLanguage = async (page: Page, language: string) => {
    const expectedElement = language === LANGUAGES.HE ? 'מקורות' : 'Texts';
    const expectedBodyClass = language === LANGUAGES.HE ? 'interface-hebrew' : 'interface-english';
    const langParam = language === LANGUAGES.HE ? 'he' : 'en';
    // Helper function to verify language is correct
    const verifyLanguage = async (): Promise<boolean> => {
        await page.waitForLoadState('domcontentloaded');
        const elementVisible = await page.getByRole('banner').getByRole('link', { name: expectedElement, exact: true }).first().isVisible().catch(() => false);
        const bodyClass = await page.locator('body').getAttribute('class') || '';
        return elementVisible && bodyClass.includes(expectedBodyClass);
    };
    // Check if we're already in the correct language
    if (await verifyLanguage()) {
        return;
    }
    const currentUrl = page.url();
    // Strategy 1: Direct URL navigation with lang parameter (most reliable for staging)
    try {
        const urlObj = new URL(currentUrl);
        urlObj.searchParams.set('lang', langParam);
        await page.goto(urlObj.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('domcontentloaded');
        if (await verifyLanguage()) {
            console.log('Strategy 1 (URL navigation) succeeded');
            return;
        }
    } catch (error) {
        console.log('Strategy 1 (URL navigation) failed:', error);
    }
    // Strategy 2: UI-based language change
    try {
        console.log(`Strategy 2: UI-based language change`);
        const isLoggedIn = await page.getByRole('link', { name: /see my saved texts|צפה בטקסטים שמורים/i }).isVisible().catch(() => false);
        if (isLoggedIn) {
            await page.locator('.myProfileBox .profile-pic').click();
            await expect(page.locator('.interfaceLinks-menu.profile-menu')).toBeVisible({ timeout: 3000 });
        } else {
            await page.locator('.interfaceLinks-button').click();
        }
        if (language === LANGUAGES.EN) {
            await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
        } else if (language === LANGUAGES.HE) {
            await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click();
        }
        await page.waitForTimeout(1000);
        await page.waitForLoadState('domcontentloaded');
        if (await verifyLanguage()) {
            console.log(`Strategy 2: UI-based language change succeeded`);
            return;
        }
    } catch (error) {
        console.log(`Strategy 2: UI-based language change failed:`, error);
    }
    throw new Error(`All language change strategies failed for ${language}. Current URL: ${page.url()}`);
};


//expireLogoutCookie is located in utils rather than loginPage because it is used in multiple places;
//it involves removing authentication (cookies) rather than logging out    
/**
 * Simulates a logout by removing the sessionid cookie
 * note that you still need to trigger logout by typing, refreshing, etc on the test itself
 * @param context - The Playwright browser context
 * @returns true if a sessionid cookie was found and removed, false otherwise
 */
export const expireLogoutCookie = async (context: BrowserContext) => {
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c: any) => c.name === 'sessionid');
  if (sessionCookie) {    // Overwrite the sessionid cookie with an expired one to remove it
    await context.addCookies([
      {
        name: 'sessionid',
        value: '',
        domain: sessionCookie.domain,
        path: sessionCookie.path,
        expires: Math.floor(Date.now() / 1000) - 1000, // Expired in the past
        httpOnly: sessionCookie.httpOnly,
        secure: sessionCookie.secure,
        sameSite: sessionCookie.sameSite,
      }
    ]);
    return true;
  } else {
    return false;
  }
};
        
/*METHODS TO NAVIGATE TO A PAGE */

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    let page: Page = await context.newPage();
    await page.goto(url);
    await changeLanguage(page, language);
    await page.goto(url);

    //await hideAllModalsAndPopups(page);
    await hideAllModalsAndPopups(page);
    return page
}

export const goToPageWithUser = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE, user = testUser) => {
    // Use a persistent auth file to store/reuse login state
    let page: Page;
    if (!fs.existsSync(AUTH_FILE)) {
        // No auth file, perform login and save storage state
        page = await context.newPage();
        await page.goto('/login', {waitUntil: 'domcontentloaded'});
        const loginPage = new LoginPage(page, language);
        await changeLanguage(page, language);
        await loginPage.loginAs(user);
        // Save storage state for future reuse
        await page.context().storageState({ path: AUTH_FILE });
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        return page;
    }
    // If auth file exists, create a new context with storageState and open the page
    const browser = context.browser();
    if (!browser) {
        throw new Error('Browser instance is null. Cannot create a new context.');
    }
    page = await browser.newPage();
    // Load the storage state from the auth file
    const storageState = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    const storageCookies = await updateStorageState(storageState, 'interfaceLang', language);
    if (storageCookies == null) {
        throw new Error(`No cookies found in storage state for language ${language}`);
    }
    await page.context().addCookies(storageCookies);
    // Navigate to the desired URL
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await changeLanguage(page, language);
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await hideModals(page);
    return page;
}

export const getPathAndParams = (url: string) => {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
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


/*DOM RELATED METHODS */

export const isClickable = async (locator: Locator): Promise<boolean> => {
  try {
    // Check visibility
    const visible = await locator.isVisible();
    if (!visible) return false;

    // Check computed style: pointer-events
    const pointerEvents = await locator.evaluate(el =>
      window.getComputedStyle(el).pointerEvents
    );
    if (pointerEvents === 'none') return false;

    // Check if the element could be clicked (no overlays etc.)
    await locator.click({ trial: true });

    return true;
  } catch (e) {
    return false;
  }
}

/* NETWORK RELATED METHODS */

export const simulateOfflineMode = async (page: Page) => {
  await page.context().setOffline(true);
};

export const simulateOnlineMode = async (page: Page) => {
  await page.context().setOffline(false);
};
