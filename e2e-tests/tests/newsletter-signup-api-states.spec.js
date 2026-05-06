/**
 * Playwright Tests: Newsletter Signup — API State Scenarios
 *
 * Tests that require route interception to control API responses:
 * 1. Loading indicator is visible while the lists API is pending.
 * 2. Form renders with 6 default newsletters when the lists API fails.
 */

import { test, expect } from '@playwright/test';

test.describe('Newsletter Signup — API state scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      document.cookie = 'cookiesNotificationAccepted=1; path=/; max-age=31536000';
    });
  });

  test('loading indicator is visible while newsletter lists API is pending', async ({ page }) => {
    let releaseRoute;
    const hold = new Promise(r => (releaseRoute = r));

    // Hold the lists response until we've verified the loading state
    await page.route('**/api/newsletter/lists', async (route) => {
      await hold;
      await route.fulfill({ json: { newsletters: [] } });
    });

    await page.goto('/newsletter', { waitUntil: 'load' });
    await expect(page.locator('.newsletterLoadingState')).toBeVisible();
    releaseRoute();
  });

  test('form renders 6 default newsletters when lists API returns 500', async ({ page }) => {
    await page.route('**/api/newsletter/lists', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Service unavailable' }),
      })
    );

    await page.goto('/newsletter', { waitUntil: 'load' });
    await page.waitForSelector('.selectableOptionLabel', { timeout: 10000 });

    // NEWSLETTERS constant has 6 entries; all should render as fallback
    await expect(page.locator('label.selectableOptionLabel')).toHaveCount(6);
  });
});
