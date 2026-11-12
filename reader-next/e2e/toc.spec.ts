import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary", { name: "Table of Contents" });

// @feature BOK-008 @feature BOK-009 @feature BOK-011 @feature BOK-015 @feature BOK-018
test.describe("Table of contents in the sidebar (verified against sefaria.org)", () => {
  test("Genesis: fifty chapters and the portions with their aliyot; place marked; a click goes there and the sidebar stays", async ({ page }) => {
    await open(page, "/Genesis.2.3?lang=en&with=Navigation");
    await expect(side(page).getByRole("heading", { name: "Chapters" })).toBeVisible({ timeout: 20_000 });
    await expect(side(page).getByRole("heading", { name: "Torah Portions" })).toBeVisible();
    await expect(side(page).locator("a[data-current]")).toHaveCount(2); // chapter 2 and the first aliyah of Bereshit
    await expect(side(page).getByRole("link", { name: "2", exact: true }).first()).toHaveAttribute("data-current", "true");
    await side(page).getByRole("link", { name: "5", exact: true }).first().click();
    await expect(page).toHaveURL(/\/Genesis\.5\b.*with=Navigation/);
    await expect(side(page).locator("a[data-current]").first()).toHaveText("5");
  });

  // parity S10 (VERIFIED on sefaria.org 2026-11-10, 1280px): the portions as on the book page, two 50% columns of 61px rows (a 24px
  // name over 14px inline aliyot), 392px in all, not a column of 50px tiles
  test("Genesis: the Torah portions in two columns, aliyot as small inline numbers (as sefaria.org)", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=bi&with=Navigation");
    const bereshit = side(page).getByRole("link", { name: "Bereshit", exact: true });
    await expect(bereshit).toBeVisible({ timeout: 20_000 });
    const box = (name: string) => side(page).getByRole("link", { name, exact: true }).evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top), fontSize: getComputedStyle(e).fontSize };
    });
    const [b, n, l] = [await box("Bereshit"), await box("Noach"), await box("Lech Lecha")];
    expect(n.top).toBe(b.top); // side by side
    expect(n.left).toBeGreaterThan(b.left);
    expect(l.left).toBe(b.left); // the third starts the next row
    expect(l.top - b.top).toBeGreaterThanOrEqual(58);
    expect(l.top - b.top).toBeLessThanOrEqual(64);
    expect(b.fontSize).toBe("24px");
    const aliyah = await side(page).locator('[data-fixed-group="part"]').first().locator("a[data-current]").evaluate((e) => {
      const c = getComputedStyle(e);
      return [c.fontSize, c.display, Math.round(e.getBoundingClientRect().height) < 30];
    });
    expect(aliyah).toEqual(["14px", "inline", true]);
  });

  test("Berakhot: chapters, each with its dafs, the plain list left out", async ({ page }) => {
    await open(page, "/Berakhot.3b?lang=en&with=Navigation");
    await expect(side(page).getByRole("button", { name: "Chapter 1; MeEimatai" })).toBeVisible({ timeout: 20_000 });
    await expect(side(page).getByRole("link", { name: "3b", exact: true })).toHaveAttribute("data-current", "true");
    await expect(side(page).getByRole("radiogroup")).toHaveCount(0);
  });

  test("it is one click from Resources", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await page.getByRole("complementary").getByRole("link", { name: "Table of Contents" }).click();
    await expect(side(page).getByRole("heading", { name: "Chapters" })).toBeVisible({ timeout: 20_000 });
    await side(page).getByRole("link", { name: "Resources" }).click();
    await expect(page.getByRole("complementary").getByRole("link", { name: "About this Text" })).toBeVisible();
  });
});
