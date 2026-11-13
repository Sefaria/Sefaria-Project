import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// On a phone the sidebar is shown in place of its panel, and sefaria.org writes no sidebar language into the address (ReaderApp.jsx
// makeHistoryState, isMobileConnectionsOpen; measured 2026-11-13 on a Pixel 7: `/Genesis.1?lang=bi&with=all`). The sidebar follows the
// panel's language there (lang=he: Hebrew, lang=en: English), and its language button changes the panel's language.
const toggle = (page: Page) => page.locator('button[aria-label^="Show in"]').first();

// @feature RTE-043 @feature SHL-033 @feature CON-070
test.describe("the sidebar's address on a phone", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only"));

  test("choosing a verse opens the sidebar with no lang2 in the address @mobile", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await page.locator('[role="group"][data-ref="Genesis 1:3"]').click();
    await expect(page).toHaveURL(/\/Genesis\.1\.3\?lang=bi&with=all$/);
    await expect(toggle(page)).toBeVisible();
  });

  test("an address without lang2 opens the sidebar in the panel's language, and stays as it is @mobile", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=he&with=all");
    await expect(toggle(page)).toHaveAttribute("aria-label", "Show in English"); // the sidebar is in Hebrew
    await page.waitForTimeout(800);
    expect(new URL(page.url()).search).toBe("?lang=he&with=all");
    await open(page, "/Genesis.1.3?lang=en&with=all");
    await expect(toggle(page)).toHaveAttribute("aria-label", "Show in Hebrew");
    await page.waitForTimeout(800);
    expect(new URL(page.url()).search).toBe("?lang=en&with=all");
  });

  test("the sidebar's language button changes the panel's language @mobile", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en&with=all");
    await toggle(page).click();
    await expect(page).toHaveURL(/\/Genesis\.1\.3\?lang=he&with=all$/);
    await expect(toggle(page)).toHaveAttribute("aria-label", "Show in English");
  });
});
