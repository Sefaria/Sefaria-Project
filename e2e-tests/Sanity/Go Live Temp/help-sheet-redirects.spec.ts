import { test, expect } from '@playwright/test';
import { goToPageWithLang, assertStatusNotError } from "../../utils";
import { LANGUAGES } from '../../globals';
import { MODULE_URLS } from '../../constants';
import { HELP_SHEET_REDIRECTS, HELP_SHEET_REDIRECTS_HE } from '../../helpDeskLinksConstants'

/**
 * Test suite for Help Sheet to Zendesk Help Center redirects
 *
 * Purpose: Verify that old help sheet URLs redirect properly to new Zendesk help pages
 * - English: www.sefaria.org/sheets/* → help.sefaria.org/hc/en-us/*
 * - Hebrew: www.sefaria.org.il/sheets/* → help.sefaria.org/hc/he/*
 *  
*/

test.describe('Help Sheet to Zendesk Redirects - English', () => {

  test.beforeEach(async ({ context }) => {
    // Setup with English language
    await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/texts`, LANGUAGES.EN);
  });

  // Create a test for each English redirect mapping
  for (const redirect of HELP_SHEET_REDIRECTS) {
    test(`${redirect.sheetTitle} (${redirect.sheetPath}) redirects correctly`, async ({ page }) => {
      // Construct the test URL by prepending MODULE_URLS.EN.LIBRARY to the sheet path
      const testUrl = `${MODULE_URLS.EN.LIBRARY}${redirect.sheetPath}`;

      // Navigate to the sheet URL
      const response = await page.goto(testUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Verify we didn't get an error status
      assertStatusNotError(
        response?.status() ?? 0,
        [404, 500, 502, 503, 504],
        testUrl
      );

      // Get the final URL after redirect
      const finalUrl = page.url();

      // Verify redirect to Zendesk help center (English)
      expect(finalUrl).toContain('help.sefaria.org');
      expect(finalUrl).toContain('/hc/en');

      // Verify the specific Zendesk link
      // Normalize URLs for comparison (remove trailing slashes)
      const normalizeUrl = (url: string) => {
        const urlObj = new URL(url);
        return urlObj.origin + urlObj.pathname.replace(/\/$/, '');
      };

      const expectedBase = normalizeUrl(redirect.zendeskUrl);
      const actualBase = normalizeUrl(finalUrl);

      expect(actualBase).toBe(expectedBase);
    });
  }
});

test.describe('Help Sheet to Zendesk Redirects - Hebrew', () => {

  test.beforeEach(async ({ context }) => {
    // Setup with Hebrew language
    await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/texts`, LANGUAGES.HE);
  });

  // Create a test for each Hebrew redirect mapping
  for (const redirect of HELP_SHEET_REDIRECTS_HE) {
    test(`${redirect.sheetTitle} (${redirect.sheetPath}) redirects correctly`, async ({ page }) => {
      // Construct the test URL by prepending MODULE_URLS.HE.LIBRARY to the sheet path
      const testUrl = `${MODULE_URLS.HE.LIBRARY}${redirect.sheetPath}`;

      // Navigate to the sheet URL
      const response = await page.goto(testUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Verify we didn't get an error status
      assertStatusNotError(
        response?.status() ?? 0,
        [404, 500, 502, 503, 504],
        testUrl
      );

      // Get the final URL after redirect
      const finalUrl = page.url();

      // Verify redirect to Zendesk help center (Hebrew)
      expect(finalUrl).toContain('help.sefaria.org');
      expect(finalUrl).toContain('/hc/he');

      // Verify the specific Zendesk link
      // Normalize URLs for comparison (remove trailing slashes)
      const normalizeUrl = (url: string) => {
        const urlObj = new URL(url);
        return urlObj.origin + urlObj.pathname.replace(/\/$/, '');
      };

      const expectedBase = normalizeUrl(redirect.zendeskUrl);
      const actualBase = normalizeUrl(finalUrl);

      expect(actualBase).toBe(expectedBase);
    });
  }
});
