import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// The panel title, as on www.sefaria.org (measured 2026-11-13, ReaderPanel.jsx openTextConnectionsPanel): a plain click or Enter opens the
// connections of the ref the title names, without leaving the reader; the link's href is the book's page, which a modified or middle
// click opens in a new tab. Desktop: /Genesis.1?lang=bi → /Genesis.1?lang=bi&with=all&lang2=en; scrolled into Genesis 2 →
// /Genesis.2?lang=bi&with=all&lang2=en.
const title = (page: Page) => page.locator('[data-panel-id] a[href="/Genesis"]').first();
const sidebar = (page: Page) => page.getByRole("complementary");

// @feature TXD-020 @feature CON-012
test.describe("the panel title", () => {
  test("a plain click opens the connections of the address the title names, and stays in the reader @mobile", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await expect(title(page)).toHaveAttribute("href", "/Genesis");
    await page.evaluate(() => ((window as unknown as { __samePage?: boolean }).__samePage = true));
    await title(page).click();
    await expect(page).toHaveURL(/\/Genesis\.1\?lang=bi&with=all(&lang2=en)?$/);
    await expect(sidebar(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true);
  });

  test("after scrolling, the section in view (the title's ref)", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
    await open(page, "/Genesis.1.20?lang=bi");
    const box = await page.locator("[data-reader-scroller]").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
    for (let i = 0; i < 40 && !/\/Genesis\.2\.\d+\?/.test(page.url()); i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(250);
    }
    await expect(page).toHaveURL(/\/Genesis\.2\.\d+\?/);
    await expect(title(page)).toHaveText("Genesis 2");
    await title(page).click();
    await expect(page).toHaveURL(/\/Genesis\.2\?lang=bi&with=all&lang2=en$/);
  });

  test("Enter on the title does the same", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
    await open(page, "/Genesis.1?lang=bi");
    await title(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/Genesis\.1\?lang=bi&with=all&lang2=en$/);
  });

  test("a middle click opens the book's page in a new tab and leaves the reader as it was", async ({ page, context }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
    await open(page, "/Genesis.1?lang=bi");
    const url = page.url();
    const [tab] = await Promise.all([context.waitForEvent("page"), title(page).click({ button: "middle" })]);
    await tab.waitForURL(/\/Genesis(\?|$)/);
    expect(new URL(tab.url()).pathname).toBe("/Genesis");
    expect(page.url()).toBe(url);
    await expect(sidebar(page)).toHaveCount(0);
  });
});
