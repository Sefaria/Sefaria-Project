import {DEFAULT_LANGUAGE, LANGUAGES, SOURCE_LANGUAGES, testUser} from './globals'
import {BrowserContext}  from 'playwright-core';
import type { Page } from 'playwright-core';
import { expect, Locator } from '@playwright/test';

import { SourceSheetEditorPage } from './pages/sourceSheetEditor.page';

let langCookies: any = [];
let loginCookies: any = [];
let currentLocation: string = ''; 

export const hideModals = async (page: Page, options: { skipGuideOverlay?: boolean } = {}) => {
    const { skipGuideOverlay = false } = options;
    
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '#interruptingMessageBox {display: none;}';
        document.head.appendChild(style);
    });
    
    // Also dismiss guide overlay by default (unless skipped for guide tests)
    if (!skipGuideOverlay) {
        await dismissGuideOverlayIfPresent(page);
    }
}
  
export const hideTopBanner = async (page: Page) => {
    await page.evaluate(() => {
      // Remove the top banner directly
      const banner = document.querySelector('header.readerControls.fullPanel.sheetReaderControls');
      if (banner && banner.parentElement) {
        banner.parentElement.removeChild(banner);
      }
      // Also remove its container (if it's wrapping/intercepting events)
      const outer = document.querySelector('.readerControlsOuter');
      if (outer && outer.parentElement) {
        outer.parentElement.removeChild(outer);
      }
      // Just in case, remove any z-index overlays or leftover styles
      const style = document.createElement('style');
      style.innerHTML = `
        .readerControlsOuter, header.readerControls.fullPanel.sheetReaderControls {
          display: none !important;
          pointer-events: none !important;
          visibility: hidden !important;
          z-index: -9999 !important;
        }
      `;
      document.head.appendChild(style);
    });
  };
  

export const changeLanguageLoggedOut = async (page: Page, language: string) => {
    await page.locator('.interfaceLinks-button').click()
    if (language === LANGUAGES.EN) {
        //await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
        await page.locator('.interfaceLinks-option.int-en').click();
    } else if (language === LANGUAGES.HE) {
        //await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click()
        await page.locator('.interfaceLinks-option.int-he').click();

    }
}

export const changeLanguageLoggedIn = async (page: Page, language: string) => {
    // Open the profile dropdown by clicking the profile icon
    const profileIcon = page.locator('.myProfileBox .profile-pic');
    await profileIcon.click();
  
    // Wait for the dropdown to appear
    const menu = page.locator('.interfaceLinks-menu.profile-menu');
    await expect(menu).toBeVisible();
  
    // Select the correct language link
    const languageLink = language === LANGUAGES.HE
      ? page.locator('#select-hebrew-interface-link')
      : page.locator('#select-english-interface-link');
  
    await expect(languageLink).toBeVisible();
    await languageLink.click();
  };

/**
 * General change language function that determines whether user is logged in or out
 * and calls the appropriate language change function
 * @param page Page object
 * @param language Language to change to (from LANGUAGES constants)
 */
export const changeLanguage = async (page: Page, language: string) => {
    // Check if user is logged in by looking for profile icon
    const isLoggedIn = await page.locator('.myProfileBox .profile-pic').isVisible();
    
    if (isLoggedIn) {
        await changeLanguageLoggedIn(page, language);
    } else {
        await changeLanguageLoggedOut(page, language);
    }
};

export const goToPageWithLang = async (context: BrowserContext, url: string, language=DEFAULT_LANGUAGE) => {
    // If a cookie already has contents, clear it so that the language cookie can be reset
    if (langCookies.length) {
        await context.clearCookies()
    }   
    const page: Page = await context.newPage();
    
    // Handle URL properly with BASE_URL
    await page.goto(buildFullUrl(url));

    // Only change language if the IP address doesn't match the specified language.
    const inIsrael = await isIsraelIp(page)
    if( ( inIsrael && language == LANGUAGES.EN) || 
        ( !inIsrael && language == LANGUAGES.HE)){
        await changeLanguage(page, language);
    }

    langCookies = await context.cookies();

    await context.addCookies(langCookies);
    await page.reload()
    return page

}

// export const loginUser = async (page: Page, user=testUser, language=DEFAULT_LANGUAGE) => {
//     await page.goto('/login');
//     await changeLanguage(page, language);
//     await page.getByPlaceholder('Email Address').fill(user.email ?? '');
//     await page.getByPlaceholder('Password').fill(user.password ?? '');
//     await page.getByRole('button', { name: 'Login' }).click();
//     await page.getByRole('link', { name: 'See My Saved Texts' }).isVisible();
// }

export const loginUser = async (page: Page, user = testUser, language = DEFAULT_LANGUAGE) => {
    // First, navigate to the login page
    await page.goto(buildFullUrl('/login'));
    await page.waitForLoadState('networkidle');
    
    await changeLanguage(page, language);
    await page.getByPlaceholder('Email Address').fill(user.email ?? '');
    await page.getByPlaceholder('Password').fill(user.password ?? '');
    await page.getByRole('button', { name: 'Login' }).click();
  
    // Wait for navigation to complete — ideally back to the previous page
    await page.waitForLoadState('networkidle');
  };
  


export const goToPageWithUser = async (context: BrowserContext, url: string, user=testUser, options: { skipGuideOverlay?: boolean } = {}) => {
    const { skipGuideOverlay = false } = options;
    
    if (!loginCookies.length) {
        const page: Page = await context.newPage();
        await loginUser(page, user)
        loginCookies = await context.cookies();
    }
    await context.addCookies(loginCookies);
    // this is a hack to get the cookie to work
    const newPage: Page = await context.newPage();
    
    // Handle URL properly with BASE_URL
    await newPage.goto(buildFullUrl(url));
    
    await hideModals(newPage, { skipGuideOverlay });
    
    return newPage;
}

export const goToSourceSheetEditorWithUser = async (context: BrowserContext, url: string, user=testUser) => {
    return await goToPageWithUser(context, '/sheets/new', user);
}

export const getPathAndParams = (url: string) => {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
}

/**
 * Helper to build full URL from relative path using BASE_URL environment variable
 * @param url Relative or absolute URL
 * @returns Full URL with proper BASE_URL handling
 */
export const buildFullUrl = (url: string): string => {
    if (url.startsWith('http')) return url;
    const baseUrl = process.env.BASE_URL || 'http://localhost:8000';
    return `${baseUrl.replace(/\/$/, '')}${url.startsWith('/') ? url : '/' + url}`;
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


/**
 * Checks whether an element is visible, has pointer events,
 * and is not obscured by another element.
 */
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

/**
 * Safely dismiss guide overlay if it appears, without breaking if it doesn't exist
 * This is designed for backwards compatibility in tests that don't specifically test the guide
 * @param page Page object
 * @param timeout Timeout in milliseconds (default: 5000)
 */
export const dismissGuideOverlayIfPresent = async (page: Page, timeout: number = 5000) => {
    try {
        // Give guide overlay a moment to appear if it's going to
        await page.waitForTimeout(2000);
        
        // Use aggressive client-side dismissal to ensure guide doesn't block other tests
        await page.evaluate(() => {
            const guideOverlay = document.querySelector('.guideOverlay') as HTMLElement;
            if (guideOverlay) {
                // First try to click the close button properly
                const closeButton = document.querySelector('.guideOverlay .readerNavMenuCloseButton.circledX') as HTMLElement;
                if (closeButton) {
                    closeButton.click();
                }
                
                // Aggressively hide the overlay to ensure it doesn't interfere
                guideOverlay.style.display = 'none';
                guideOverlay.style.visibility = 'hidden';
                guideOverlay.style.opacity = '0';
                guideOverlay.style.pointerEvents = 'none';
                guideOverlay.style.zIndex = '-9999';
                
                // Also remove it from the DOM completely for good measure
                guideOverlay.remove();
            }
        });
        
        // Short wait for dismissal to take effect
        await page.waitForTimeout(500);
        
    } catch (e) {
        // Guide overlay might not exist, that's fine for backwards compatibility
        console.log('Guide overlay dismissal completed or not needed:', e.message);
    }
};