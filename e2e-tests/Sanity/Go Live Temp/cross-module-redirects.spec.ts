import { test, expect } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups, normalizeUrl, urlMatches, assertUrlMatches, assertStatusNotError } from "../../utils";
import { BROWSER_SETTINGS } from '../../globals';
import { MODULE_URLS } from '../../constants';

test.describe('Cross-Module Redirects - Library to Voices', () => {

  test.beforeEach(async ({ context }) => {
    // goToPageWithUser handles auth setup, navigation, and modal hiding
    await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);
  });

  test('Settings Profile Redirect', async ({ page }) => {
    // Navigate to settings/profile on library module
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/settings/profile`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/settings/profile`);
    // Verify redirect occurred to voices module
    // Note: Without authentication, this may show login modal, but URL should still be on voices domain
    const finalUrl = page.url();
    expect(finalUrl).toContain(MODULE_URLS.EN.VOICES);
    expect(finalUrl).toContain('/settings/profile');
  });

  test('Community Page Redirect', async ({ page }) => {
    // Navigate to community on library module
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/community`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/community`);

    // Verify redirect occurred to voices home page
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/`, false);
  });

  test('Collections Redirect', async ({ page }) => {
    // Navigate to collections on library module and capture response
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/collections`, { waitUntil: 'networkidle' });

    // Verify we didn't get a 404 (or similar) and that redirect occurred to voices collections
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/collections`);

    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/collections`, true);
  });

  test('Collections Redirect - Specific collection - Ignore Query Params', async ({ page }) => {
    // Navigate to specific collection on library module
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/collections/-midrash-calendar`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/collections/-midrash-calendar`);
    // Verify redirect occurred to voices with same path
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/collections/-midrash-calendar`, true);
  });
  // Probably Redundant with the below test
  test('Profile Redirect ', async ({ page }) => {
    // Navigate to profile without user (logged in, so should redirect to user's profile)
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/profile`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/profile`);
    // Verify redirect occurred to voices profile
    // Note: When logged in, /profile redirects to /profile/{username}?tab=sheets
    // This is expected behavior 
    const finalUrl = page.url();
    expect(finalUrl).toContain(MODULE_URLS.EN.VOICES);
    expect(finalUrl).toContain('/profile/');
  });

  test('Profile Redirect - With User', async ({ page }) => {
    // Navigate to specific user profile on library module
    const respone = await page.goto(`${MODULE_URLS.EN.LIBRARY}/profile/qa-automation`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(respone?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/profile/qa-tester`);

    await page.waitForTimeout(5000);

    // Verify redirect occurred to voices profile
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/profile/qa-automation`, true);
  });

  test('Sheets Redirect - Get Started Page', async ({ page }) => {
    // Navigate to sheets base URL on library module
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/sheets`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/sheets`);
    // Verify redirect occurred to voices getstarted page
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/getstarted/`, false);
  });

  test('Sheets Redirect - Specific Sheet ID', async ({ page }) => {
    // Navigate to specific sheet on library module
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/sheets/510219`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/sheets/510219`);
    // Verify redirect occurred to voices with same sheet ID
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/sheets/510219`, true);
  });
});

test.describe('Cross-Module Redirects (Library to voices) - Query Parameter Preservation', () => {

  test.beforeEach(async ({ context }) => {
    // goToPageWithUser handles auth setup, navigation, and modal hiding
    await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);
  });

  test('Query Parameters Preserved', async ({ page }) => {
    // Navigate with query parameters
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/settings/profile?tab=notifications&test=123`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/settings/profile?tab=notifications&test=123`);
    // Verify redirect occurred with query parameters preserved
    const finalUrl = page.url();
    const finalUrlObj = new URL(finalUrl);

    // Check base URL redirected correctly
    expect(finalUrlObj.origin + finalUrlObj.pathname).toContain(`${MODULE_URLS.EN.VOICES}/settings/profile`);

    // Check query parameters are preserved
    expect(finalUrlObj.searchParams.get('tab')).toBe('notifications');
    expect(finalUrlObj.searchParams.get('test')).toBe('123');
  });

  test('Collections Query Parameters Preserved', async ({ page }) => {
    // Navigate with query parameters
    const response = await page.goto(`${MODULE_URLS.EN.LIBRARY}/collections?sort=recent`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.LIBRARY}/collections?sort=recent`);
    // Verify redirect occurred with query parameters
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/collections`, false);
  });
});

test.describe('Cross-Module Redirects (Library to vouces) - 301 Status Codes', () => {

  test.beforeEach(async ({ context }) => {
    // goToPageWithUser handles auth setup, navigation, and modal hiding
    await goToPageWithUser(context, `${MODULE_URLS.EN.LIBRARY}/texts`, BROWSER_SETTINGS.enUser);
  });

  test('Settings Profile Returns 301 Permanent Redirect', async ({ page }) => {
    // Listen for response to check status code
    let redirectStatusCode: number | null = null;
    page.on('response', response => {
      if (response.url() === `${MODULE_URLS.EN.LIBRARY}/settings/profile` ||
        response.url() === `${MODULE_URLS.EN.LIBRARY}/settings/profile/`) {
        redirectStatusCode = response.status();
      }
    });

    await page.goto(`${MODULE_URLS.EN.LIBRARY}/settings/profile`, { waitUntil: 'networkidle' });

    // Verify 301 permanent redirect status
    expect(redirectStatusCode).toBe(301);
  });

  test('Community Returns 301 Permanent Redirect', async ({ page }) => {
    // Listen for response to check status code
    let redirectStatusCode: number | null = null;
    page.on('response', response => {
      if (response.url() === `${MODULE_URLS.EN.LIBRARY}/community` ||
        response.url() === `${MODULE_URLS.EN.LIBRARY}/community/`) {
        redirectStatusCode = response.status();
      }
    });

    await page.goto(`${MODULE_URLS.EN.LIBRARY}/community`, { waitUntil: 'networkidle' });

    // Verify 301 permanent redirect status
    expect(redirectStatusCode).toBe(301);
  });
});



test.describe('Voices-Module Redirects - No Redirect Loops on Voices', () => {

  test.beforeEach(async ({ context }) => {
    // goToPageWithUser handles auth setup, navigation, and modal hiding
    await goToPageWithUser(context, `${MODULE_URLS.EN.VOICES}`, BROWSER_SETTINGS.enUser);
  });

  test('No Redirect When Already on Voices - Settings Profile', async ({ page }) => {
    // Navigate to settings/profile already on voices module
    const response = await page.goto(`${MODULE_URLS.EN.VOICES}/settings/profile`, { waitUntil: 'networkidle' });
    // Verify we didn't get a 404 (or similar)
    assertStatusNotError(response?.status() ?? 0, [404, 500, 502, 503, 504], `${MODULE_URLS.EN.VOICES}/settings/profile`);
    // Verify we stayed on voices (no redirect loop)
    const finalUrl = page.url();
    expect(finalUrl).toContain(MODULE_URLS.EN.VOICES);
    expect(finalUrl).toContain('/settings/profile');
  });

  test('No Redirect When Already on Voices - Home', async ({ page }) => {
    // Navigate to voices home
    await page.goto(`${MODULE_URLS.EN.VOICES}`, { waitUntil: 'networkidle' });
    await hideAllModalsAndPopups(page);

    // Verify we stayed on voices home (no redirect)
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/`, false);
  });

  test('No Redirect When Already on Voices - Get Started Page', async ({ page }) => {
    // Navigate to sheets on voices module
    await page.goto(`${MODULE_URLS.EN.VOICES}/sheets`, { waitUntil: 'networkidle' });

    // Verify we stayed on voices (no redirect)
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/getstarted/`, false);
  });

  test('No Redirect When Already on Voices - Specific Sheet', async ({ page }) => {
    // Navigate to specific sheet on voices module
    await page.goto(`${MODULE_URLS.EN.VOICES}/sheets/510219`, { waitUntil: 'networkidle' });

    // Verify sheet loads without redirect
    const finalUrl = page.url();
    assertUrlMatches(finalUrl, `${MODULE_URLS.EN.VOICES}/sheets/510219`, true);
  });

  test('Settings Account Returns 404 on Voices', async ({ page }) => {
    // Navigate to settings/account (should 404 per CSV line 12)
    const response = await page.goto(`${MODULE_URLS.EN.VOICES}/settings/account`, { waitUntil: 'networkidle' });

    // Verify 404 status
    expect(response?.status()).toBe(404);
  });
});