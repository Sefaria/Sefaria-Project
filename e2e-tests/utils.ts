import { DEFAULT_LANGUAGE, LANGUAGES, t } from './globals'
import { BrowserContext } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expect, Locator } from '@playwright/test';
import { MODULE_URLS, MODULE_SELECTORS } from './constants';
import path from 'path';
import fs from 'fs';

let currentLocation: string = '';


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

/**
 * Fixes cookie domains to use parent domain for cross-subdomain access
 * Converts subdomain-specific cookies (e.g., www.example.com) to parent domain (.example.com)
 * This allows cookies to work across all subdomains (www, voices, etc.)
 */
export const fixCookieDomainsForCrossSubdomain = (cookies: Cookie[]): Cookie[] => {
  return cookies.map((cookie: Cookie) => {
    // Extract parent domain from subdomain-specific domain
    // e.g., "www.baseurl.org" -> ".baseurl.org"
    // e.g., "baseurl.org" -> ".baseurl.org"

    let domain = cookie.domain;

    // Remove leading dot if present
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }

    // Split domain into parts
    const parts = domain.split('.');

    // Determine the registrable domain so we only strip a leftmost *subdomain*
    // label (www, voices, chiburim, …) and never a label that belongs to the
    // registrable domain itself. Israeli domains use a 2-level public suffix
    // (.org.il / .co.il / .ac.il / …), so their registrable domain is the last
    // THREE labels (sefaria.org.il); everywhere else it's the last two
    // (sefaria.org). Without this, "sefaria.org.il" would be wrongly reduced to
    // the public suffix ".org.il" — a domain browsers reject, silently dropping
    // the session on the Hebrew site.
    const isIsraeliCompoundTld =
      parts.length >= 3 &&
      parts[parts.length - 1] === 'il' &&
      /^(org|co|ac|gov|net|k12|muni|idf)$/.test(parts[parts.length - 2]);
    const minRegistrableLabels = isIsraeliCompoundTld ? 3 : 2;

    if (parts.length > minRegistrableLabels) {
      // Strip the leftmost subdomain label, keep the rest as the parent domain.
      // e.g. www.sefaria.org -> .sefaria.org ; www.sefaria.org.il -> .sefaria.org.il ;
      //      www.modularization.cauldron.sefaria.org -> .modularization.cauldron.sefaria.org
      return { ...cookie, domain: '.' + parts.slice(1).join('.') };
    }

    // Already at the registrable domain — just ensure a leading dot.
    return { ...cookie, domain: '.' + domain };
  });
};

/**
 * Installs context-level overlay suppression for Strapi-driven interrupting
 * messages and banners. Layer 1 of the two-layer overlay-suppression model
 * (see `hideAllModalsAndPopups` for the click-through fallback layer).
 *
 * Two independent guards, both wired before the first page is created so the
 * preconditions exist before any navigation:
 *
 * 1. `addInitScript` monkey-patches `Storage.prototype.getItem` so any
 *    `modal_*` / `banner_*` key returns the string `"true"`. This causes the
 *    `shouldShow()` short-circuits in `InterruptingMessage` (Misc.jsx:2100)
 *    and `Banner` (Misc.jsx:2282) to treat every campaign as already
 *    dismissed, killing the Strapi "Sustainer" modal before the `showDelay`
 *    timer even arms. SignUpModal (Misc.jsx:1964-2011) renders from
 *    `this.props.show` and never touches localStorage, so auth-gated tests
 *    (RP-121/122/123/131/132/161) are unaffected. `TopicsLaunchBanner` uses
 *    `sessionStorage`, not `localStorage`, so the patch doesn't reach it.
 *
 * 2. `context.route('**\/api/strapi/graphql-cache*')` short-circuits the
 *    GraphQL fetch with an empty payload matching the live response shape
 *    (`{ data: { modals: { data: [] }, banners: { data: [] },
 *    sidebarAds: { data: [] } } }`). Belt-and-braces fallback for the case
 *    where Sefaria changes the localStorage key shape; with the script in
 *    place, this guard is strictly redundant, but it costs nothing and
 *    documents intent.
 *
 * @param context - The Playwright browser context. Call BEFORE
 *   `context.newPage()` — both guards apply to all pages created after this
 *   call (`addInitScript` is documented as applying to every page in the
 *   context; `route` is registered context-wide).
 */
export const installOverlaySuppression = async (context: BrowserContext) => {
  // Layer 1a: monkey-patch localStorage.getItem for modal_/banner_ keys.
  // Runs before any page script (init scripts execute after document is
  // created but before any other script — Playwright docs).
  await context.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && (key.startsWith('modal_') || key.startsWith('banner_'))) {
        return 'true';
      }
      return originalGetItem.call(this, key);
    };
  });

  // Layer 1b: short-circuit the Strapi GraphQL cache endpoint with an empty
  // payload. Matches the live response shape captured 2026-05-20 against
  // www.sefaria.org/api/strapi/graphql-cache.
  await context.route('**/api/strapi/graphql-cache*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          modals: { data: [] },
          banners: { data: [] },
          sidebarAds: { data: [] },
        },
      }),
    });
  });

  // Layer 1c: pre-seed the cookies-accepted cookie so the CookiesNotification
  // component (Misc.jsx:2861) short-circuits at constructor time and never
  // renders. Without this, the banner appears post-hydration (after
  // hideAllModalsAndPopups has already run) when the storage-state lacks the
  // accepted cookie — observed mid-test on Voices during the Sanity suite.
  // Cookie domains are derived from SANDBOX_URL / SANDBOX_URL_IL (via
  // MODULE_URLS) and prepended with `.` so they apply across all subdomains
  // (www, voices, chiburim) the tests visit. This keeps the suppression
  // working on every configured sandbox — production (.sefaria.org), staging
  // (.sefariastaging.org), and cauldron branches alike.
  const cookieDomainEN = '.' + new URL(MODULE_URLS.EN.LIBRARY).hostname.replace(/^www\./, '');
  const cookieDomainIL = '.' + new URL(MODULE_URLS.HE.LIBRARY).hostname.replace(/^www\./, '');
  await context.addCookies([
    { name: 'cookiesNotificationAccepted', value: '1', domain: cookieDomainEN, path: '/' },
    { name: 'cookiesNotificationAccepted', value: '1', domain: cookieDomainIL, path: '/' },
  ]);
};

/**
 * Click-through fallback for the residual non-Strapi overlays — layer 2 of
 * the overlay-suppression model. Strapi-driven banners (`Sustainer` modal,
 * generic banner, sidebar promos) are suppressed at the context level by
 * `installOverlaySuppression`; this helper only needs to deal with the
 * survivors:
 *
 *   - `.cookiesNotification` — first-visit EU/CCPA banner
 *   - `.ub-emb-iframe-wrapper`/`.ub-emb-close` — UseBounce third-party widget
 *   - `.guideOverlay` — GuideOverlay.jsx in-app guide cards
 *   - `#bannerMessage` — Sefaria's own non-Strapi banner wrapper
 *   - `.siteWideBannerContent` — SiteWideBanner.jsx (chatbot/signup promo,
 *     dismissed by cookie not localStorage so still needs UI click)
 *
 * Selectors are queried in parallel with `Promise.all`; the longest wait is
 * `t(500)`, not 6 × `t(500)`, because Playwright's `isVisible({ timeout })`
 * polls until the element appears OR the timeout expires.
 */
export const hideAllModalsAndPopups = async (page: Page) => {
  const selectors = [
    '.cookiesNotification .accept, .cookiesNotification button.accept, .cookiesNotification .close',
    '.cookiesNotification [role="button"]',
    '.ub-emb-close',
    '.ub-emb-iframe-wrapper .ub-emb-visible',
    '.guideOverlay .readerNavMenuCloseButton.circledX',
    '#bannerMessage .close, #bannerMessage button.close, #bannerMessageClose',
    '.siteWideBannerContent .siteWideBannerClose',
  ];

  await Promise.all(selectors.map(async (s) => {
    try {
      const el = page.locator(s).first();
      if (await el.isVisible({ timeout: t(500) })) {
        await el.click({ timeout: t(2000) }).catch(() => {});
      }
    } catch { /* selector miss is fine — overlay isn't present */ }
  }));
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
  const languageClass = language === LANGUAGES.HE ? '.hebrewLanguageLink' : '.englishLanguageLink';
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
    await page.waitForTimeout(t(1000));



    const languageToggle = page.locator(`.header .headerDropdownMenu .dropdownLinks-menu.open .dropdownLinks-options .dropdownLanguageToggle`);
    await languageToggle.waitFor({ state: 'visible', timeout: t(5000) });
    const languageToggleClass = languageToggle.locator(languageClass);
    await languageToggleClass.waitFor({ state: 'visible', timeout: t(5000) });
    await languageToggleClass.click();

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(t(500));

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
    } catch (e) { }

    await page.goto(urlObj.toString(), { waitUntil: 'domcontentloaded', timeout: t(30000) });
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
  const sessionCookies = cookies.filter((c: any) => c.name === 'sessionid');
  if (sessionCookies.length === 0) {
    return false;
  }
  // Sefaria can set sessionid on multiple domain/path tuples after
  // fixCookieDomainsForCrossSubdomain (parent domain + per-host duplicates).
  // Clear every match — clearing only the first one leaves the auth alive
  // on the surviving entry.
  const expiredAt = Math.floor(Date.now() / 1000) - 1000;
  await context.addCookies(sessionCookies.map((c: any) => ({
    name: 'sessionid',
    value: '',
    domain: c.domain,
    path: c.path,
    expires: expiredAt,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
  })));
  return true;
};

/*METHODS TO NAVIGATE TO A PAGE */

/**
 * Anonymous entry point — seeds the interfaceLang cookie on the parent domain
 * and navigates once. No file caching: anonymous sessions don't need
 * persistence and the previous file-cache layer caused stale-state bugs after
 * Sefaria changed the geo-detection cookie shape.
 */
export const goToPageWithLang = async (context: BrowserContext, url: string, language = DEFAULT_LANGUAGE) => {
  const parsed = new URL(url);
  const parts = parsed.hostname.split('.');
  // Same parent-domain rule fixCookieDomainsForCrossSubdomain uses, so that
  // www.* and voices.* share the cookie.
  const parentDomain = parts.length >= 3
    ? '.' + parts.slice(1).join('.')
    : '.' + parsed.hostname;

  await context.addCookies([{
    name: 'interfaceLang',
    value: language,
    domain: parentDomain,
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    httpOnly: false,
    secure: parsed.protocol === 'https:',
    sameSite: 'Lax',
  }]);

  // MUST be wired before context.newPage(): the init-script side of
  // installOverlaySuppression applies to every page in the context, but only
  // for pages created after the call (per Playwright docs on
  // BrowserContext.addInitScript).
  await installOverlaySuppression(context);

  const page = await context.newPage();
  await gotoOrThrow(page, url, { waitUntil: 'domcontentloaded' });
  // CLAUDE.md rule 6 smell: this is "wait for state" (React hydration to
  // attach event handlers), not "deliberate pacing." Tried replacing with
  // document.fonts.ready + 2 RAFs — RP-001 and RP-002 then flaked 3/5,
  // confirming the wait is gating on React hydration, not on layout/fonts.
  // Replacing it cleanly requires probing a Sefaria-specific
  // post-hydration signal (e.g. a window flag set in ReaderApp.componentDidMount,
  // or an element class added only client-side). See utils.ts cleanup backlog.
  await page.waitForTimeout(t(1500));
  await hideAllModalsAndPopups(page);
  return page;
};

/**
 * Authenticated entry point — applies the storage state written by
 * global-setup.ts. The file MUST already exist; if it doesn't, the suite is
 * being driven without globalSetup wired up.
 */
export const goToPageWithUser = async (context: BrowserContext, url: string, settings: any) => {
  const language = settings.lang;
  const authPath = path.join(__dirname, settings.file);
  if (!fs.existsSync(authPath)) {
    throw new Error(
      `Auth file '${settings.file}' is missing — this test requires a logged-in user that was ` +
      `never set up, so it cannot run. global-setup.ts writes this file once before any worker ` +
      `starts; an absent file means that account's login FAILED or was SKIPPED during global-setup ` +
      `(login failures are non-fatal there, so the run continues for other suites). ` +
      `Look at the [global-setup] output at the top of this run for a "FAILED to authenticate" / ` +
      `"SKIPPED" line naming this profile and explaining why — common causes: missing or wrong ` +
      `PLAYWRIGHT_*_EMAIL / PLAYWRIGHT_*_PASSWORD credentials, an unreachable /login, or (for a ` +
      `Hebrew / .org.il profile) an account whose Site-Language is not Hebrew. Fix that account and re-run.`
    );
  }
  const storageState = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  // Defensive re-application — global-setup.ts already fixed cookie domains,
  // but the cost is negligible and protects against a hand-edited file.
  storageState.cookies = fixCookieDomainsForCrossSubdomain(storageState.cookies);
  storageState.cookies = storageState.cookies.map((c: Cookie) =>
    c.name === 'interfaceLang' ? { ...c, value: language } : c
  );
  await context.addCookies(storageState.cookies);

  // Same ordering rule as goToPageWithLang — must precede context.newPage().
  await installOverlaySuppression(context);

  const page = await context.newPage();
  await gotoOrThrow(page, url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(t(1500));
  await hideAllModalsAndPopups(page);
  return page;
};

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
  let response = await page.goto(url, options);
  // Retry once on transient 5xx — sandbox occasionally throttles under parallel-worker burst load.
  if (response && response.status() >= 500 && response.status() < 600) {
    await page.waitForTimeout(t(1500));
    response = await page.goto(url, options);
  }
  if (response && response.status() === 404) {
    throw new Error(`Error 404: Navigation to ${url} returned 404`);
  }
  else if (response && response.status() >= 400) {
    throw new Error(`Error ${response.status()}: Navigation to ${url} returned status ${response.status()}`);
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

  await button.waitFor({ state: 'visible', timeout: t(5000) });
  await hideAllModalsAndPopups(page);
  await button.click();

  // Wait for dropdown to appear (use .open to avoid strict mode violation with multiple dropdowns)
  await page.locator(`${MODULE_SELECTORS.DROPDOWN}.open`).waitFor({ state: 'visible', timeout: t(5000) });
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
  await option.waitFor({ state: 'visible', timeout: t(5000) });

  if (openNewTab) {
    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      option.click()
    ]);
    await newPage.waitForLoadState('domcontentloaded');
    return newPage;
  } else {
    await option.click();
    await page.waitForLoadState('domcontentloaded');
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
    // Wait for potential logged-out icon or profile pic to load (whichever appears first)
    await page.waitForLoadState('domcontentloaded', { timeout: t(4000) }).catch(() => { /* continue if it times out */ });

    // Check if logged-out icon is visible
    const loggedOutIcon = page.locator(MODULE_SELECTORS.ICONS.USER_MENU);
    const isLoggedOut = await loggedOutIcon.isVisible({ timeout: t(2000) });
    if (isLoggedOut) {
      // log that logged out icon is visible for debugging purposes
      // console.log(`User is not logged in (logged-out icon visible)`);
      return false;
    }

    // Check if profile pic is visible (logged in)
    const profilePic = page.locator(MODULE_SELECTORS.HEADER.PROFILE_PIC);
    const isLoggedIn = await profilePic.isVisible({ timeout: t(2000) }).catch(() => false);
    if (isLoggedIn) {
      // console.log('User is logged in (profile pic visible)');
    }
    return isLoggedIn;
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
    // console.log('User is not logged in, skipping logout. Check if test was supposed to be logged in or not.');
    return;
  }

  await openHeaderDropdown(page, 'user');
  const logoutOption = page.locator(MODULE_SELECTORS.DROPDOWN_OPTION)
    .filter({ hasText: /log out|sign out|logout|ניתוק/i });

  await logoutOption.waitFor({ state: 'visible', timeout: t(5000) });
  await logoutOption.click();
  await page.waitForLoadState('domcontentloaded');
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

  if (await createButton.isVisible({ timeout: t(2000) })) {
    await createButton.click();
  } else if (await createLink.isVisible({ timeout: t(2000) })) {
    await createLink.click();
  } else {
    await page.goto(`${MODULE_URLS.EN.VOICES}/sheets/new`);
  }

  await page.waitForURL(url => url.toString() !== initialUrl, { timeout: t(10000) });
  await page.waitForLoadState('domcontentloaded');
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
  const isOnLibrary = currentUrl.includes(MODULE_URLS.EN.LIBRARY);
  const isOnVoices = currentUrl.includes(MODULE_URLS.EN.VOICES);

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
  await loadingHeading.waitFor({ state: 'detached', timeout: t(15000) }).catch(() => { });

  const segment = page.locator(selector);
  await segment.waitFor({ state: 'visible', timeout: t(10000) });
  return segment;
};

/**
 * Get module name from URL
 * @param url - Page URL
 * @returns 'library' | 'voices' | 'unknown'
 */
export const getModuleFromUrl = (url: string): 'library' | 'voices' | 'unknown' => {
  if (url.includes(MODULE_URLS.EN.LIBRARY) || url.includes('www.')) {
    return 'library';
  } else if (url.includes(MODULE_URLS.EN.VOICES) || url.includes('voices.')) {
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

/**
 * Assert that URLs match, throwing a detailed error if they don't
 * @param actual - The actual URL
 * @param expectedBase - The expected base URL
 * @param ignoreQueryParams - Whether to ignore query parameters in comparison
 * @throws Error with expected vs actual URL details if URLs don't match
 */
export const assertUrlMatches = (actual: string, expectedBase: string, ignoreQueryParams: boolean = false) => {
  if (!urlMatches(actual, expectedBase, ignoreQueryParams)) {
    throw new Error(`URL mismatch — expected base: "${expectedBase}" (ignoreQuery=${ignoreQueryParams})\nActual: "${actual}"`);
  }
};

/**
 * Assert that a response status is NOT one of the error codes
 * @param status - The response status code
 * @param errorCodes - Array of error codes to check against
 * @param url - Optional URL that was being navigated to
 * @throws Error if status is one of the error codes
 */
export const assertStatusNotError = (status: number, errorCodes: number[] = [404, 500, 502, 503, 504], url?: string) => {
  if (errorCodes.includes(status)) {
    const urlPart = url ? ` from URL: ${url}` : '';
    throw new Error(`Response returned error status: ${status} (expected one of: ${errorCodes.join(', ')})${urlPart}`);
  }
};
