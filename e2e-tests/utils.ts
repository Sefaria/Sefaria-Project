import {DEFAULT_LANGUAGE, LANGUAGES, SOURCE_LANGUAGES, testUser} from './globals'
import {BrowserContext}  from 'playwright-core';
import type { Page } from 'playwright-core';
import { expect, Locator } from '@playwright/test';

import { SourceSheetEditorPage } from './pages/sourceSheetEditor.page';

let langCookies: any = [];
let loginCookies: any = [];
let currentLocation: string = ''; 

/**
 * Get timeout values appropriate for the environment
 * Remote environments get longer timeouts to handle network latency
 */
export const getEnvironmentTimeouts = (url?: string) => {
    const isRemote = url ? !isLocalDevelopment(url) : !isLocalDevelopment(process.env.BASE_URL || 'localhost');
    
    return {
        navigation: isRemote ? 30000 : 10000,      // Page navigation and loading
        element: isRemote ? 20000 : 10000,         // Element selectors
        api: isRemote ? 15000 : 10000,             // API calls
        short: isRemote ? 5000 : 2000,             // Short waits
        medium: isRemote ? 8000 : 3000,            // Medium waits
    };
};

/**
 * Hide disruptive modal elements and wait for page stability.
 * 
 * Waits for network idle state, hides interrupting messages via CSS,
 * and optionally dismisses the guide overlay. Uses retry mechanism
 * for network idle waiting to handle slow remote environments.
 * 
 * @param page - Playwright page object
 * @param options - Configuration including guide overlay preservation
 */
export const hideModals = async (page: Page, options: { preserveGuideOverlay?: boolean } = {}) => {
    const { preserveGuideOverlay = false } = options;
    
    // Wait for network idle with retry on timeout
    await withRetryOnTimeout(
        () => page.waitForLoadState('networkidle'),
        { page }
    );
    
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '#interruptingMessageBox {display: none;}';
        document.head.appendChild(style);
    });
    
    // Also dismiss guide overlay by default (unless preserved for guide tests)
    if (!preserveGuideOverlay) {
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
    const originalUrl = page.url();
    const isLocal = isLocalDevelopment(originalUrl);
    
    if (isLocal) {
        // For local development, handle potential broken redirects
        try {
            await page.locator('.interfaceLinks-button').click()
            
            if (language === LANGUAGES.EN) {
                await page.locator('.interfaceLinks-option.int-en').click();
            } else if (language === LANGUAGES.HE) {
                await page.locator('.interfaceLinks-option.int-he').click();
            }
            
            // Wait for navigation to complete (or timeout quickly if no redirect)
            try {
                await page.waitForURL(url => url !== originalUrl, { timeout: 3000 });
            } catch {
                // No redirect happened, which is fine
            }
            
            const currentUrl = page.url();
            
            // Check if we got redirected to a broken URL or not back to original page
            if (isBrokenLanguageRedirect(currentUrl, originalUrl) || !currentUrl.includes(new URL(originalUrl).pathname)) {
                console.log(`Detected broken redirect to: ${currentUrl}, navigating back and refreshing`);
                
                // Go back to the original page
                await page.goBack();
                
                // Wait for page to load
                await page.waitForLoadState('networkidle');
                
                // Refresh the page to apply the language change
                await page.reload();
                
                // Wait for the page to load again
                await page.waitForLoadState('networkidle');
            } else {
                // Normal redirect, wait for it to complete
                await page.waitForLoadState('networkidle');
            }
            
            // Final safety check: ensure we're back on the original page
            const finalUrl = page.url();
            if (!finalUrl.includes(new URL(originalUrl).pathname)) {
                console.log(`Still not on original page (${finalUrl}), navigating back to ${originalUrl}`);
                await page.goto(originalUrl);
                await page.waitForLoadState('networkidle');
            }
            
        } catch (error) {
            console.log(`Language change error: ${error}, attempting fallback approach`);
            
            // Fallback: navigate back to original URL and refresh
            await page.goto(originalUrl);
            await page.reload();
            await page.waitForLoadState('networkidle');
        }
    } else {
        // For non-local environments, use the normal approach
        await page.locator('.interfaceLinks-button').click()
        if (language === LANGUAGES.EN) {
            //await page.getByRole('banner').getByRole('link', { name: /English/i }).click();
            await page.locator('.interfaceLinks-option.int-en').click();
        } else if (language === LANGUAGES.HE) {
            //await page.getByRole('banner').getByRole('link', { name: /עברית/i }).click()
            await page.locator('.interfaceLinks-option.int-he').click();
        }
        await page.waitForLoadState('networkidle');
    }
}



export const changeLanguageLoggedIn = async (page: Page, language: string) => {
    const originalUrl = page.url();
    const isLocal = isLocalDevelopment(originalUrl);
    
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
    
    if (isLocal) {
        // For local development, handle potential broken redirects
        try {
            // Click the language link
            await languageLink.click();
            
            // Wait for navigation to complete (or timeout quickly if no redirect)
            try {
                await page.waitForURL(url => url !== originalUrl, { timeout: 3000 });
            } catch {
                // No redirect happened, which is fine
            }
            
            const currentUrl = page.url();
            
            // Check if we got redirected to a broken URL or not back to original page
            if (isBrokenLanguageRedirect(currentUrl, originalUrl) || !currentUrl.includes(new URL(originalUrl).pathname)) {
                console.log(`Detected broken redirect to: ${currentUrl}, navigating back and refreshing`);
                
                // Go back to the original page
                await page.goBack();
                
                // Wait for page to load
                await page.waitForLoadState('networkidle');
                
                // Refresh the page to apply the language change
                await page.reload();
                
                // Wait for the page to load again
                await page.waitForLoadState('networkidle');
            } else {
                // Normal redirect, wait for it to complete
                await page.waitForLoadState('networkidle');
            }
            
            // Final safety check: ensure we're back on the original page
            const finalUrl = page.url();
            if (!finalUrl.includes(new URL(originalUrl).pathname)) {
                console.log(`Still not on original page (${finalUrl}), navigating back to ${originalUrl}`);
                await page.goto(originalUrl);
                await page.waitForLoadState('networkidle');
            }
            
        } catch (error) {
            console.log(`Language change error: ${error}, attempting fallback approach`);
            
            // Fallback: navigate back to original URL and refresh
            await page.goto(originalUrl);
            await page.reload();
            await page.waitForLoadState('networkidle');
        }
    } else {
        // For non-local environments, use the normal approach
        await languageLink.click();
        await page.waitForLoadState('networkidle');
    }
  };

/**
 * Check if running in local development environment
 * @param url URL to check
 * @returns boolean indicating if this is local development
 */
export const isLocalDevelopment = (url: string): boolean => {
    return url.includes('localhost') || url.includes('127.0.0.1');
};

/**
 * Retry mechanism for network operations that may timeout on slow remote environments.
 * 
 * Local development: Operations run once without retries for speed.
 * Remote environments: Up to 3 retries with exponential backoff (1s, 2s, 4s delays).
 * 
 * Only retries operations that fail due to timeouts - other errors are thrown immediately.
 * This prevents infinite retry loops while handling network instability.
 * 
 * @param operation - The async function to retry (e.g., page.goto, waitForLoadState)
 * @param context - Object containing page or URL to determine if running locally
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @param baseDelay - Starting delay in milliseconds, doubles each retry (default: 1000ms)
 * @returns Promise that resolves with the operation result
 */
export const withRetryOnTimeout = async <T>(
    operation: () => Promise<T>,
    context: { page?: Page; url?: string },
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> => {
    // Determine if we're in local environment
    let isLocal = true;
    if (context.page) {
        isLocal = isLocalDevelopment(context.page.url());
    } else if (context.url) {
        isLocal = isLocalDevelopment(context.url);
    }
    
    // If local environment, just run operation once without retry
    if (isLocal) {
        return await operation();
    }
    
    let lastError: Error;
    
    // Try the operation with retries (remote environment only)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            
            // Only retry on timeout errors
            const isTimeoutError = isTimeoutFailure(error);
            
            if (!isTimeoutError || attempt === maxRetries) {
                // Don't retry non-timeout errors or if we've exhausted retries
                throw error;
            }
            
            // Calculate exponential backoff delay
            const delay = baseDelay * Math.pow(2, attempt);
            
            console.log(`⏳ Attempt ${attempt + 1} failed with timeout, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError!;
};

/**
 * Determines if an error is caused by a timeout and should be retried.
 * 
 * Looks for timeout-related keywords in error messages to distinguish
 * network timeouts from other types of failures (auth errors, 404s, etc.).
 * 
 * @param error - The error object from a failed operation
 * @returns true if error appears to be timeout-related, false otherwise
 */
const isTimeoutFailure = (error: any): boolean => {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorName = error.name?.toLowerCase() || '';
    
    // Common timeout indicators
    const timeoutKeywords = [
        'timeout',
        'timed out',
        'time out',
        'networkidle',
        'navigation timeout',
        'page.waitfor',
        'waitforloadstate',
        'waitforselector'
    ];
    
    return timeoutKeywords.some(keyword => 
        errorMessage.includes(keyword) || errorName.includes(keyword)
    );
};



/**
 * Check if URL appears to be a broken redirect from local language change
 * @param url URL to check
 * @param originalUrl Original URL before language change
 * @returns boolean indicating if this looks like a broken redirect
 */
export const isBrokenLanguageRedirect = (url: string, originalUrl: string): boolean => {
    // If we're no longer on localhost but were originally, it's likely a broken redirect
    if (isLocalDevelopment(originalUrl) && !isLocalDevelopment(url)) {
        return true;
    }
    
    // If URL changed but doesn't look like a proper redirect, it might be broken
    if (url !== originalUrl && url.includes('set-language-cookie')) {
        return true;
    }
    
    // Check for chrome error pages or other indicators of broken redirects
    if (url.includes('chrome-error://') || url.includes('about:blank') || url.includes('data:')) {
        return true;
    }
    
    return false;
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

/**
 * Log in a user with automatic retry handling for network timeouts.
 * 
 * Handles navigation to login page, language selection, form filling,
 * and submission. Uses retry mechanism for page navigation and loading
 * to handle slow remote environments.
 * 
 * @param page - Playwright page object
 * @param user - User credentials (defaults to testUser)
 * @param language - Interface language (defaults to DEFAULT_LANGUAGE)
 */
export const loginUser = async (page: Page, user = testUser, language = DEFAULT_LANGUAGE) => {
    // Navigate to login page with retry on timeout
    await withRetryOnTimeout(
        () => page.goto(buildFullUrl('/login')),
        { page }
    );
    
    // Wait for page to load with retry on timeout
    await withRetryOnTimeout(
        () => page.waitForLoadState('networkidle'),
        { page }
    );
    
    // Use the main language change function which now includes local development handling
    await changeLanguageLoggedOut(page, language);
    
    await page.getByPlaceholder('Email Address').fill(user.email ?? '');
    await page.getByPlaceholder('Password').fill(user.password ?? '');
    await page.getByRole('button', { name: 'Login' }).click();
  
    // Wait for navigation to complete with retry on timeout
    await withRetryOnTimeout(
        () => page.waitForLoadState('networkidle'),
        { page }
    );
  };
  


/**
 * Navigate to a page as an authenticated user with automatic retry handling.
 * 
 * Sets up user authentication via cookies, creates a new page context,
 * and navigates to the specified URL. Uses retry mechanism for page
 * navigation to handle network timeouts on remote environments.
 * 
 * @param context - Browser context for managing cookies and pages
 * @param url - Relative URL to navigate to (e.g., '/sheets/new')
 * @param user - User credentials (defaults to testUser)
 * @param options - Configuration options including guide overlay preservation
 * @returns Promise resolving to the new page
 */
export const goToPageWithUser = async (context: BrowserContext, url: string, user=testUser, options: { preserveGuideOverlay?: boolean } = {}) => {
    const { preserveGuideOverlay = false } = options;
    
    if (!loginCookies.length) {
        const page: Page = await context.newPage();
        await loginUser(page, user)
        loginCookies = await context.cookies();
    }
    await context.addCookies(loginCookies);
    // this is a hack to get the cookie to work
    const newPage: Page = await context.newPage();
    
    // Navigate to page with retry on timeout
    await withRetryOnTimeout(
        () => newPage.goto(buildFullUrl(url)),
        { page: newPage }
    );
    
    await hideModals(newPage, { preserveGuideOverlay });
    
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
    const timeouts = getEnvironmentTimeouts(page.url());
    await page.waitForSelector('.editorContent', { timeout: timeouts.element });
    return page;
};

/**
 * Simulate slow API response for guide loading by intercepting the guide API call
 * @param page Page object
 * @param delayMs Delay in milliseconds (auto-adjusted for environment if not specified)
 * @param guideType Guide type to intercept (default: "editor")
 */
export const simulateSlowGuideLoading = async (page: Page, delayMs?: number, guideType: string = "editor") => {
    // Use environment-appropriate delay if not specified
    if (delayMs === undefined) {
        const timeouts = getEnvironmentTimeouts(page.url());
        // Use shorter delay for remote environments to avoid compounding slowness
        delayMs = isLocalDevelopment(page.url()) ? 8000 : 4000;
    }
    
    await page.route(`**/api/guides/${guideType}`, async (route) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        await route.continue();
    });
};

/**
 * Simulate guide API error by intercepting the guide API call and returning an error response
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
 * Properly sets the cookie to prevent guide from reappearing after language changes
 * @param page Page object
 * @param timeout Timeout in milliseconds (default: 5000)
 */
export const dismissGuideOverlayIfPresent = async (page: Page, timeout: number = 5000) => {
    try {
        // Give guide overlay a moment to appear if it's going to
        await page.waitForTimeout(2000);
        
        // Check if guide overlay exists
        const guideExists = await page.locator('.guideOverlay').isVisible().catch(() => false);
        
        if (guideExists) {
            // Try to click the close button properly to trigger cookie setting
            try {
                await page.locator('.guideOverlay .readerNavMenuCloseButton.circledX').click({ timeout: 3000 });
                // Wait for close animation/effect
                await page.waitForTimeout(1000);
            } catch (closeError) {
                console.log('Close button click failed, using fallback dismissal');
                
                                 // Fallback: Set the cookie manually and hide the overlay
                 await page.evaluate(() => {
                     // Set the cookie manually (same logic as GuideOverlay.jsx)
                     const cookieName = 'guide_overlay_seen_editor';
                     const currentDate = new Date().toISOString();
                     // Using jQuery cookie like the original component
                     const $ = (window as any).$;
                     if ($ && $.cookie) {
                         $.cookie(cookieName, currentDate, {path: "/", expires: 20*365});
                     }
                    
                    // Remove the overlay from DOM
                    const guideOverlay = document.querySelector('.guideOverlay') as HTMLElement;
                    if (guideOverlay) {
                        guideOverlay.remove();
                    }
                });
            }
        }
        
        // Ensure any remaining overlay elements are cleaned up
        await page.evaluate(() => {
            const allOverlays = document.querySelectorAll('.guideOverlay');
            allOverlays.forEach(overlay => overlay.remove());
        });
        
    } catch (e) {
        // Guide overlay might not exist, that's fine for backwards compatibility
        console.log('Guide overlay dismissal completed or not needed:', e.message);
    }
};