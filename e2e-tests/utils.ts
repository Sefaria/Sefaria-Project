import {DEFAULT_LANGUAGE, LANGUAGES, BROWSER_SETTINGS} from './globals'
import {BrowserContext}  from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, Locator } from '@playwright/test';
import { LoginPage } from './pages/loginPage';
import { MODULE_URLS, MODULE_SELECTORS } from './constants';
import path from 'path';
import fs from 'fs';

// NOTE: per simplification, modal-close attempts are inlined in hideAllModalsAndPopups

let currentLocation: string = '';

// Clear all auth files before starting tests to ensure fresh login
const clearAuthFiles = () => {
  const authFiles = Object.values(BROWSER_SETTINGS).map((setting) => path.join(__dirname, setting.file));
  authFiles.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
};

clearAuthFiles();


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

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

interface StorageState {
  cookies: Cookie[];
  origins: any[];
}

/**
 * Fixes cookie domains to use parent domain for cross-subdomain access
 * Converts subdomain-specific cookies (e.g., www.example.com) to parent domain (.example.com)
 * This allows cookies to work across all subdomains (www, voices, etc.)
 */
const fixCookieDomainsForCrossSubdomain = (cookies: Cookie[]): Cookie[] => {
  return cookies.map((cookie: Cookie) => {
    // Extract parent domain from subdomain-specific domain
    // e.g., "www.modularization.cauldron.sefaria.org" -> ".modularization.cauldron.sefaria.org"
    // e.g., "modularization.cauldron.sefaria.org" -> ".modularization.cauldron.sefaria.org"

    let domain = cookie.domain;

    // Remove leading dot if present
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }

    // Split domain into parts
    const parts = domain.split('.');

    // If domain has subdomain (more than 2 parts, accounting for multi-level TLDs)
    // e.g., www.modularization.cauldron.sefaria.org has 5 parts
    // We want to remove the first subdomain (www, voices, etc.) and keep the rest
    if (parts.length >= 3) {
      // Remove first subdomain and create parent domain with leading dot
      const parentDomain = '.' + parts.slice(1).join('.');
      return { ...cookie, domain: parentDomain };
    }

    // If already a parent domain or no subdomain, add leading dot if not present
    if (!cookie.domain.startsWith('.')) {
      return { ...cookie, domain: '.' + cookie.domain };
    }

    return cookie;
  });
};

const updateStorageState = async (storageState: StorageState, key: string, value: any) => {
  // Modify the cookies as needed
  storageState.cookies = storageState.cookies.map((cookie: Cookie) => {
    if (cookie.name === key) {
      return { ...cookie, value: value };
    }
    return cookie;
  });

  // Fix cookie domains for cross-subdomain access
  storageState.cookies = fixCookieDomainsForCrossSubdomain(storageState.cookies);

  return storageState.cookies;
}

// Individual hide helpers removed — use hideAllModalsAndPopups(page) instead.

/**
 * Hides all common popups, modals, and banners that might interfere with tests
 * This is called automatically by navigation functions but can also be called manually
 */
export const hideAllModalsAndPopups = async (page: Page) => {
  const selectors = [
    '#interruptingMessageClose', '.ub-emb-close', '.genericBanner .close, .genericBanner button.close',
    '.cookiesNotification .accept, .cookiesNotification button.accept, .cookiesNotification .close',
    '.guideOverlay .readerNavMenuCloseButton.circledX', '#bannerMessage .close, #bannerMessage button.close',
    '.readerControlsOuter .close, .readerControlsOuter button.close'
  ];
  for (const s of selectors) {
    try {
      const el = page.locator(s);
      if (await el.isVisible({ timeout: 1500 })) await el.click();
    } catch (e) {}
  }
  await page.waitForTimeout(300);
};

/**
 *language change function with multiple fallback strategies
 * 
 * @param page - The Playwright page object
 * @param language - Target language (LANGUAGES.EN or LANGUAGES.HE)
 */
export const changeLanguage = async (page: Page, language: string) => {
    await toggleLanguage(page, language)
  };


export const toggleLanguage = async (page: Page, language: string) => {
  await hideAllModalsAndPopups(page);

  const expectedBodyClass = language === LANGUAGES.HE ? 'interface-hebrew' : 'interface-english';
  const langParam = language === LANGUAGES.HE ? 'he' : 'en';

  // Check if already in target language
  const body = page.locator('body');
  const currentClasses = await body.getAttribute('class') || '';
  if (currentClasses.includes(expectedBodyClass)) {
    return;
  }

  try {
    // Use dropdown menu to toggle language
    await openHeaderDropdown(page, 'user');
    await page.waitForTimeout(300);

    const languageToggle = page.locator('.dropdownLanguageToggle');
    await languageToggle.waitFor({ state: 'visible', timeout: 5000 });
    await languageToggle.click();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Verify language changed
    const newBodyClass = await body.getAttribute('class') || '';
    if (!newBodyClass.includes(expectedBodyClass)) {
      throw new Error(`Language toggle failed. Expected ${expectedBodyClass}`);
    }
  } catch (error) {
    console.error('Dropdown language toggle failed, using cookie fallback:', error);
    // Fallback: cookie + URL navigation
    const currentUrl = page.url();
    const urlObj = new URL(currentUrl);
    urlObj.searchParams.set('lang', langParam);

    try {
      const cookie = {
        name: 'interfaceLang',
        value: langParam,
        domain: urlObj.hostname,
        path: '/',
        httpOnly: false,
        secure: urlObj.protocol === 'https:',
        sameSite: 'Lax' as const,
        expires: Math.floor(Date.now() / 1000) + 3600
      };
      await page.context().addCookies([cookie]);
    } catch (e) {}

    await page.goto(urlObj.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
  }
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
    const settings = BROWSER_SETTINGS[language as keyof typeof BROWSER_SETTINGS];
    const filePath = path.join(__dirname, settings.file);
    if (!fs.existsSync(filePath)) {
      await gotoOrThrow(page, url, { waitUntil: 'domcontentloaded' });
      await changeLanguage(page, language);

      // Save storage state and fix cookie domains for cross-subdomain access
      const storageState = await page.context().storageState();
      storageState.cookies = fixCookieDomainsForCrossSubdomain(storageState.cookies);
      fs.writeFileSync(filePath, JSON.stringify(storageState, null, 2));

      // Also fix cookies in current context for immediate use
      await page.context().addCookies(storageState.cookies);

      await gotoOrThrow(page, url, { waitUntil: 'domcontentloaded' });
    } else {
      const storageState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const storageCookies = await updateStorageState(storageState, 'interfaceLang', language);
      if (storageCookies == null) {
          throw new Error(`No cookies found in storage state for language ${language}`);
      }
      await page.context().addCookies(storageCookies);
      await gotoOrThrow(page, url, { waitUntil: 'domcontentloaded' });
    }

    //await hideAllModalsAndPopups(page);
    await hideAllModalsAndPopups(page);
    return page
}

export const goToPageWithUser = async (context: BrowserContext, url: string, settings: any) => {
    // Use a persistent auth file to store/reuse login state
    const language = settings.lang;
    const user = settings.user;
    const authPath = path.join(__dirname, settings.file);
    let page: Page;
    if (!fs.existsSync(authPath)) {
        // No auth file, perform login and save storage state
        page = await context.newPage();
        await gotoOrThrow(page, '/login', {waitUntil: 'domcontentloaded'});
        const loginPage = new LoginPage(page, language);
        await changeLanguage(page, language);
        await loginPage.loginAs(user);

        // Save storage state and fix cookie domains for cross-subdomain access
        const storageState = await page.context().storageState();
        storageState.cookies = fixCookieDomainsForCrossSubdomain(storageState.cookies);
        fs.writeFileSync(authPath, JSON.stringify(storageState, null, 2));

        // Also fix cookies in current context for immediate use
        await page.context().addCookies(storageState.cookies);

        await gotoOrThrow(page, url, {waitUntil: 'domcontentloaded'});
        return page;
    }
    // If auth file exists, create a new context with storageState and open the page
    const browser = context.browser();
    if (!browser) {
        throw new Error('Browser instance is null. Cannot create a new context.');
    }
    page = await browser.newPage();
    // Load the storage state from the auth file
    const storageState = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const storageCookies = await updateStorageState(storageState, 'interfaceLang', language);
    if (storageCookies == null) {
        throw new Error(`No cookies found in storage state for language ${language}`);
    }
    await page.context().addCookies(storageCookies);
    // Navigate to the desired URL
    await gotoOrThrow(page, url, {waitUntil: 'domcontentloaded'});
    await changeLanguage(page, language);
    await gotoOrThrow(page, url, {waitUntil: 'domcontentloaded'});
    await hideAllModalsAndPopups(page);
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

/**
 * Wrapper for page.goto that throws on 404 responses.
 * @param page - Playwright page
 * @param url - URL to navigate to
 * @param options - optional goto options
 */
export const gotoOrThrow = async (page: Page, url: string, options?: Parameters<Page['goto']>[1]) => {
  const response = await page.goto(url, options);
  if (response && response.status() === 404) {
    throw new Error(`Navigation to ${url} returned 404`);
  }
  else if (response && response.status() >= 400) {
    throw new Error(`Navigation to ${url} returned status ${response.status()}`);
  }
  
  return response;
};

// ==============================================================================
// MDL HELPER FUNCTIONS
// ==============================================================================

/**
 * Open a dropdown menu in header
 * @param page - Playwright page
 * @param dropdownType - Type of dropdown: 'user' | 'module'
 */
export const openHeaderDropdown = async (page: Page, dropdownType: 'user' | 'module') => {
  await hideAllModalsAndPopups(page);

  let button;
  if (dropdownType === 'user') {
    // Click the user menu icon (works for both logged-in and logged-out states)
    // For logged-out: clicks the profile_loggedout_mdl.svg icon
    // For logged-in: clicks the profile pic
    const loggedOutIcon = page.locator(MODULE_SELECTORS.ICONS.USER_MENU);
    const profilePic = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);

    // Check which one is visible
    const isLoggedOut = await loggedOutIcon.isVisible().catch(() => false);
    button = isLoggedOut ? loggedOutIcon : profilePic;
  } else {
    // Module switcher - use the icon directly as it's always visible
    button = page.locator(MODULE_SELECTORS.ICONS.MODULE_SWITCHER);
  }

  await button.waitFor({ state: 'visible', timeout: 5000 });
  await button.click();

  // Wait for dropdown to appear (use .open to avoid strict mode violation with multiple dropdowns)
  await page.locator(`${MODULE_SELECTORS.DROPDOWN}.open`).waitFor({ state: 'visible', timeout: 5000 });
};

/**
 * Select an option from a dropdown menu
 * @param page - Playwright page
 * @param optionText - Text of the option to select (supports regex)
 * @param openNewTab - Whether the option opens in a new tab
 */
export const selectDropdownOption = async (
  page: Page,
  optionText: string | RegExp,
  openNewTab: boolean = false
) => {
  const option = page.locator(MODULE_SELECTORS.DROPDOWN_OPTION).filter({ hasText: optionText }).first();
  await option.waitFor({ state: 'visible', timeout: 5000 });

  if (openNewTab) {
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      option.click()
    ]);
    await newPage.waitForLoadState('networkidle');
    return newPage;
  } else {
    await option.click();
    await page.waitForLoadState('networkidle');
    return null;
  }
};

/**
 * Check if user is logged in
 * @param page - Playwright page
 * @returns true if logged in, false otherwise
 */
export const isUserLoggedIn = async (page: Page): Promise<boolean> => {
  try {
    // Check if logged-out icon is visible
    const loggedOutIcon = page.locator(MODULE_SELECTORS.ICONS.USER_MENU);
    const isLoggedOut = await loggedOutIcon.isVisible({ timeout: 2000 });
    if (isLoggedOut) return false;

    // Check if profile pic is visible (logged in)
    const profilePic = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    return await profilePic.isVisible({ timeout: 2000 }).catch(() => false);
  } catch {
    return false;
  }
};

/**
 * Log out via dropdown menu
 * @param page - Playwright page
 */
export const logout = async (page: Page) => {
  if (!(await isUserLoggedIn(page))) {
    return;
  }

  await openHeaderDropdown(page, 'user');
  const logoutOption = page.locator(MODULE_SELECTORS.DROPDOWN_OPTION)
    .filter({ hasText: /log out|sign out|logout|ניתוק/i });

  await logoutOption.waitFor({ state: 'visible', timeout: 5000 });
  await logoutOption.click();
  await page.waitForLoadState('networkidle');
};

/**
 * Create a new sheet using the "Create" button in header
 * @param page - Playwright page (should be on Voices module)
 * @returns The sheet URL
 */
export const createNewSheet = async (page: Page): Promise<string> => {
  await hideAllModalsAndPopups(page);

  const createButton = page.getByRole('banner').getByRole('button', { name: /create/i });
  const createLink = page.getByRole('banner').getByRole('link', { name: /create/i });

  const initialUrl = page.url();

  if (await createButton.isVisible({ timeout: 2000 })) {
    await createButton.click();
  } else if (await createLink.isVisible({ timeout: 2000 })) {
    await createLink.click();
  } else {
    await page.goto(`${MODULE_URLS.VOICES}/sheets/new`);
  }

  await page.waitForURL(url => url.toString() !== initialUrl, { timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await hideAllModalsAndPopups(page);

  const currentUrl = page.url();
  if (!/\/sheets\/(new|\d+)/.test(currentUrl)) {
    throw new Error(`Failed to create sheet. Current URL: ${currentUrl}`);
  }

  return currentUrl;
};

/**
 * Switch between Library and Voices modules
 * @param page - Playwright page
 * @param targetModule - 'Library' or 'Voices'
 * @returns New page if opened in new tab, null otherwise
 */
export const switchModule = async (
  page: Page,
  targetModule: 'Library' | 'Voices'
): Promise<Page | null> => {
  await openHeaderDropdown(page, 'module');

  const currentUrl = page.url();
  const isOnLibrary = currentUrl.includes(MODULE_URLS.LIBRARY);
  const isOnVoices = currentUrl.includes(MODULE_URLS.VOICES);

  const needsNewTab = (targetModule === 'Library' && isOnVoices) ||
                      (targetModule === 'Voices' && isOnLibrary);

  return await selectDropdownOption(page, targetModule, needsNewTab);
};

/**
 * Wait for a text segment to be visible
 * @param page - Playwright page
 * @param selector - Selector for the segment
 */
export const waitForSegment = async (page: Page, selector: string) => {
  const loadingHeading = page.getByRole('heading', { name: 'Loading...' });
  await loadingHeading.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});

  const segment = page.locator(selector);
  await segment.waitFor({ state: 'visible', timeout: 10000 });
  return segment;
};

/**
 * Get module name from URL
 * @param url - Page URL
 * @returns 'library' | 'voices' | 'unknown'
 */
export const getModuleFromUrl = (url: string): 'library' | 'voices' | 'unknown' => {
  if (url.includes(MODULE_URLS.LIBRARY) || url.includes('www.')) {
    return 'library';
  } else if (url.includes(MODULE_URLS.VOICES) || url.includes('voices.')) {
    return 'voices';
  }
  return 'unknown';
};

// ==============================================================================
// CROSS-MODULE REDIRECT HELPER FUNCTIONS
// ==============================================================================

/**
 * Normalize URLs for comparison (handles trailing slashes and query params)
 * @param url - The URL to normalize
 * @param options - Options for normalization
 * @returns Normalized URL string
 */
export const normalizeUrl = (url: string, options: { ignoreQueryParams?: boolean, ignoreTrailingSlash?: boolean } = {}) => {
  const urlObj = new URL(url);
  let normalized = `${urlObj.origin}${urlObj.pathname}`;

  if (!options.ignoreTrailingSlash && !normalized.endsWith('/') && urlObj.pathname !== '/') {
    // Keep trailing slashes as-is for exact matching
  }

  if (!options.ignoreQueryParams && urlObj.search) {
    normalized += urlObj.search;
  }

  return normalized;
};

/**
 * Check if URLs match (with optional query param ignoring)
 * @param actual - The actual URL
 * @param expected - The expected URL
 * @param ignoreQueryParams - Whether to ignore query parameters in comparison
 * @returns true if URLs match, false otherwise
 */
export const urlMatches = (actual: string, expected: string, ignoreQueryParams: boolean = false) => {
  if (ignoreQueryParams) {
    return normalizeUrl(actual, { ignoreQueryParams: true }) === normalizeUrl(expected, { ignoreQueryParams: true });
  }
  return normalizeUrl(actual) === normalizeUrl(expected);
};
