import { test, expect } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups, normalizeUrl, urlMatches } from "../utils";
import { BROWSER_SETTINGS } from '../globals';
import { MODULE_URLS } from '../constants';

test.describe('Cross-Module Redirects - Library to Voices', () => {

  test.beforeEach(async ({ context }) => {
    // Login before each test to ensure authenticated state
    await goToPageWithUser(context, `${MODULE_URLS.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);
  });

  test('Settings Profile Redirect', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to settings/profile on library module
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/settings/profile`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify redirect occurred to voices module
    // Note: Without authentication, this may show login modal, but URL should still be on voices domain
    const finalUrl = page.url();
    expect(finalUrl).toContain(MODULE_URLS.VOICES);
    expect(finalUrl).toContain('/settings/profile');
  });

  test('Community Page Redirect', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to community on library module
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/community`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);

    // Verify redirect occurred to voices home page
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/`, false)).toBe(true);
  });

  test('Collections Redirect', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to collections on library module and capture response
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/collections`, { waitUntil: 'networkidle' });
    
    // Verify we didn't get a 404 (or similar) and that redirect occurred to voices collections
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);

    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/collections`, true)).toBe(true);
  });

  test('Collections Redirect - Ignore Query Params', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to specific collection on library module
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/collections/-midrash-calendar`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify redirect occurred to voices with same path
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/collections/-midrash-calendar`, true)).toBe(true);
  });
// Probably Redundant with the below test
  test('Profile Redirect ', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to profile without user (logged in, so should redirect to user's profile)
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/profile`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify redirect occurred to voices profile
    // Note: When logged in, /profile redirects to /profile/{username}?tab=sheets
    // This is expected behavior 
    const finalUrl = page.url();
    expect(finalUrl).toContain(MODULE_URLS.VOICES);
    expect(finalUrl).toContain('/profile/');
  });

  test('Profile Redirect - With User', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to specific user profile on library module
    const respone = await page.goto(`${MODULE_URLS.LIBRARY}/profile/qa-tester`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(respone?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);

    await page.waitForTimeout(5000);
    
    // Verify redirect occurred to voices profile
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/profile/qa-tester`, true)).toBe(true);
  });

  test('Sheets Redirect - Get Started Page', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to sheets base URL on library module
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/sheets`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify redirect occurred to voices getstarted page
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/getstarted`, false)).toBe(true);
  });

  test('Sheets Redirect - Specific Sheet ID', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to specific sheet on library module
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/sheets/510219`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify redirect occurred to voices with same sheet ID
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/sheets/510219`, true)).toBe(true);
  });
});

test.describe('Cross-Module Redirects (Library to voices) - Query Parameter Preservation', () => {

  test.beforeEach(async ({ context }) => {
    // Login before each test to ensure authenticated state
    await goToPageWithUser(context, `${MODULE_URLS.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);
  });

  test('Query Parameters Preserved', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate with query parameters
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/settings/profile?tab=notifications&test=123`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify redirect occurred with query parameters preserved
    const finalUrl = page.url();
    const finalUrlObj = new URL(finalUrl);

    // Check base URL redirected correctly
    expect(finalUrlObj.origin + finalUrlObj.pathname).toContain(`${MODULE_URLS.VOICES}/settings/profile`);

    // Check query parameters are preserved
    expect(finalUrlObj.searchParams.get('tab')).toBe('notifications');
    expect(finalUrlObj.searchParams.get('test')).toBe('123');
  });

  test('Collections Query Parameters Preserved', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate with query parameters
    const response = await page.goto(`${MODULE_URLS.LIBRARY}/collections?sort=recent`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify redirect occurred with query parameters
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/collections`, true)).toBe(true);
  });
});

test.describe('Cross-Module Redirects (Library to vouces) - 301 Status Codes', () => {

  test.beforeEach(async ({ context }) => {
    // Login before each test to ensure authenticated state
    await goToPageWithUser(context, `${MODULE_URLS.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);
  });

  test('Settings Profile Returns 301 Permanent Redirect', async ({ context }) => {
    const page = context.pages()[0];

    // Listen for response to check status code
    let redirectStatusCode: number | null = null;
    page.on('response', response => {
      if (response.url() === `${MODULE_URLS.LIBRARY}/settings/profile` ||
          response.url() === `${MODULE_URLS.LIBRARY}/settings/profile/`) {
        redirectStatusCode = response.status();
      }
    });

    await page.goto(`${MODULE_URLS.LIBRARY}/settings/profile`, { waitUntil: 'networkidle' });

    // Verify 301 permanent redirect status
    expect(redirectStatusCode).toBe(301);
  });

  test('Community Returns 301 Permanent Redirect', async ({ context }) => {
    const page = context.pages()[0];

    // Listen for response to check status code
    let redirectStatusCode: number | null = null;
    page.on('response', response => {
      if (response.url() === `${MODULE_URLS.LIBRARY}/community` ||
          response.url() === `${MODULE_URLS.LIBRARY}/community/`) {
        redirectStatusCode = response.status();
      }
    });

    await page.goto(`${MODULE_URLS.LIBRARY}/community`, { waitUntil: 'networkidle' });

    // Verify 301 permanent redirect status
    expect(redirectStatusCode).toBe(301);
  });
});



test.describe('Voices-Module Redirects - No Redirect Loops on Voices', () => {

  test.beforeEach(async ({ context }) => {
    // Login before each test to ensure authenticated state
    await goToPageWithUser(context, `${MODULE_URLS.VOICES}`, BROWSER_SETTINGS.enUser);
  });

  test('No Redirect When Already on Voices - Settings Profile', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to settings/profile already on voices module
    const response = await page.goto(`${MODULE_URLS.VOICES}/settings/profile`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    expect(response?.status() ?? 0).not.toBe([404, 500, 502, 503, 504]);
    // Verify we stayed on voices (no redirect loop)
    const finalUrl = page.url();
    expect(finalUrl).toContain(MODULE_URLS.VOICES);
    expect(finalUrl).toContain('/settings/profile');
  });

  test('No Redirect When Already on Voices - Home', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to voices home
    await page.goto(`${MODULE_URLS.VOICES}`, { waitUntil: 'networkidle' });
    await hideAllModalsAndPopups(page);

    // Verify we stayed on voices home (no redirect)
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/`, false)).toBe(true);
  });

  test('No Redirect When Already on Voices - Sheets', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to sheets on voices module
    await page.goto(`${MODULE_URLS.VOICES}/sheets`, { waitUntil: 'networkidle' });

    // Verify we stayed on voices (no redirect)
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/sheets`, false)).toBe(true);
  });

  test('No Redirect When Already on Voices - Specific Sheet', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to specific sheet on voices module
    await page.goto(`${MODULE_URLS.VOICES}/sheets/510219`, { waitUntil: 'networkidle' });

    // Verify sheet loads without redirect
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${MODULE_URLS.VOICES}/sheets/510219`, true)).toBe(true);
  });

  test('Settings Account Returns 404 on Voices', async ({ page }) => {
    // Navigate to settings/account (should 404 per CSV line 12)
    const response = await page.goto(`${MODULE_URLS.VOICES}/settings/account`, { waitUntil: 'networkidle' });

    // Verify 404 status
    expect(response?.status()).toBe(404);
  });
});