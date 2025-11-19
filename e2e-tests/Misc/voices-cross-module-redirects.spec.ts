/**
 * CROSS-MODULE REDIRECTS - Voices No-Redirect Tests
 *
 * Tests that verify no redirect loops occur when already on Voices module
 * as part of the modularization effort (SC Story 37593).
 *
 * Test Scope:
 * - Verify no redirects when accessing Voices pages from Voices
 * - Settings/Profile access on Voices stays on Voices
 * - Sheets routing behavior on Voices
 * - Home page access on Voices
 *
 * Cauldron: https://www.backend-redirect.cauldron.sefaria.org/
 * Test Plan: https://docs.google.com/spreadsheets/d/1YtW8sSlqSiQFennbHpYgiEV4F3XzQQSzmFv8kWwmNlM/edit?gid=295754673#gid=295754673
 *
 * MODULE: Voices
 * PRIORITY: High
 */

import { test, expect } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups, normalizeUrl, urlMatches } from "../utils";
import { BROWSER_SETTINGS } from '../globals';

// Get sandbox URL from environment and construct module URLs
const SANDBOX_DOMAIN = process.env.SANDBOX_URL?.replace(/^https?:\/\//, '') || 'modularization.cauldron.sefaria.org';
const TEST_URLS = {
  VOICES: `https://voices.${SANDBOX_DOMAIN}`
} as const;

test.describe('Cross-Module Redirects - No Redirect Loops on Voices', () => {

  test.beforeEach(async ({ context }) => {
    // Login before each test to ensure authenticated state
    await goToPageWithUser(context, `${TEST_URLS.VOICES}/texts`, BROWSER_SETTINGS.enUser);
  });

  test('No Redirect When Already on Voices - Settings Profile', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to settings/profile already on voices module
    await page.goto(`${TEST_URLS.VOICES}/settings/profile`, { waitUntil: 'networkidle' });

    // Verify we stayed on voices (no redirect loop)
    const finalUrl = page.url();
    expect(finalUrl).toContain(TEST_URLS.VOICES);
    expect(finalUrl).toContain('/settings/profile');
  });

  test('No Redirect When Already on Voices - Home', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to voices home
    await page.goto(`${TEST_URLS.VOICES}`, { waitUntil: 'networkidle' });
    await hideAllModalsAndPopups(page);

    // Verify we stayed on voices home (no redirect)
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${TEST_URLS.VOICES}/`, false) ||
           urlMatches(finalUrl, `${TEST_URLS.VOICES}/texts`, false)).toBe(true);
  });

  test('No Redirect When Already on Voices - Sheets', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to sheets on voices module
    await page.goto(`${TEST_URLS.VOICES}/sheets`, { waitUntil: 'networkidle' });

    // Verify we stayed on voices (no redirect)
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${TEST_URLS.VOICES}/sheets`, false)).toBe(true);
  });

  test('No Redirect When Already on Voices - Specific Sheet', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to specific sheet on voices module
    await page.goto(`${TEST_URLS.VOICES}/sheets/510219`, { waitUntil: 'networkidle' });

    // Verify sheet loads without redirect
    const finalUrl = page.url();
    expect(urlMatches(finalUrl, `${TEST_URLS.VOICES}/sheets/510219`, true)).toBe(true);
  });

  test('Settings Account Returns 404 on Voices', async ({ context }) => {
    const page = context.pages()[0];

    // Navigate to settings/account (should 404 per CSV line 12)
    const response = await page.goto(`${TEST_URLS.VOICES}/settings/account`, { waitUntil: 'networkidle' });

    // Verify 404 status
    expect(response?.status()).toBe(404);
  });
});

/**
 * IMPLEMENTATION NOTES:
 *
 * Test Organization:
 * - All tests verify that no redirect loops occur when already on Voices
 * - Tests include settings/profile, home, sheets, and 404 handling
 * - All tests use beforeEach to login with goToPageWithUser
 *
 * Key Features Tested:
 * - No redirect loops when already on target module
 * - 404 responses for non-existent routes on Voices
 * - Authenticated user access to Voices pages
 */
