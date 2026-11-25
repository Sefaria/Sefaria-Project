import { expect, test } from "@playwright/test";
import { covering, open } from "./helpers";

/*
 * On a phone sefaria.org's site header is fixed at the top of the screen (.headerInner.mobile, position fixed, z-index 1001): after
 * the page has scrolled 900px its menu button is still at 15,18 and opens the menu (measured 2026-11-18 at 375x812 on /texts,
 * /Genesis, a search and /calendars). Here it scrolled away with the page, taking the menu with it.
 */
test.describe("the site header on a phone", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only"));

  for (const path of ["/texts", "/Genesis", "/calendars"]) {
    // @feature GUI-001 @feature GUI-011
    test(`${path}: stays at the top as the page scrolls, and its menu button opens the menu @mobile`, async ({ page }) => {
      await open(page, path);
      const menu = page.locator('header [aria-controls="mobile-nav"]');
      await expect(menu).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 900));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
      const b = (await menu.boundingBox())!;
      expect([Math.round(b.x), Math.round(b.y)]).toEqual([15, 18]);
      expect(await covering(page, `[document.querySelector('header [aria-controls="mobile-nav"]')]`)).toEqual([null]);
      await menu.tap();
      await expect(page.locator("#mobile-nav")).toBeVisible();
      await menu.tap();
      await expect(page.locator("#mobile-nav")).toBeHidden();
    });
  }
});
