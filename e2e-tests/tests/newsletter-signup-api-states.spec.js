/**
 * Playwright Tests: Newsletter Signup — API State Scenarios
 *
 * Tests that require route interception to control API responses.
 * Currently covers:
 *   - Loading indicator is visible while the lists API is pending.
 */

import { test, expect } from "@playwright/test";

test.describe("Newsletter Signup — API state scenarios", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      document.cookie = "cookiesNotificationAccepted=1; path=/; max-age=31536000";
    });
  });

  test("loading indicator is visible while newsletter lists API is pending", async ({ page }) => {
    let releaseRoute;
    const hold = new Promise((r) => (releaseRoute = r));

    // Hold the lists response until we've verified the loading state
    await page.route("**/api/newsletter/lists", async (route) => {
      await hold;
      await route.fulfill({ json: { newsletters: [] } });
    });

    await page.goto("/newsletter", { waitUntil: "load" });
    await expect(page.locator(".newsletterLoadingState")).toBeVisible();
    releaseRoute();
  });
});
