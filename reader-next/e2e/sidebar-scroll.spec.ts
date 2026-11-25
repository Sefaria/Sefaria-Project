import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const bodyTop = (page: import("@playwright/test").Page) => page.locator("aside [data-panel-body]").evaluate((e) => e.scrollTop);

// @feature CON-037 Sidebar scroll position restore (VERIFIED on sefaria.org 2026-11-10: Commentary scrolled 300 → a book opens at the
// top → back at 300; through Resources the place is forgotten)
test("a category's book list keeps its place: a book opens at the top, back returns to the place, Resources forgets it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await open(page, "/Genesis.1.1?lang=bi&with=Commentary%20ConnectionsList");
  const body = page.locator("aside [data-panel-body]");
  await expect(body.getByRole("link", { name: /^Sforno\(/ })).toBeVisible({ timeout: 25_000 });
  await body.evaluate((e) => (e.scrollTop = 300));
  await expect.poll(() => bodyTop(page)).toBe(300);
  await body.getByRole("link", { name: /^Sforno\(/ }).click();
  await expect(page).toHaveURL(/with=Sforno/);
  await expect.poll(() => bodyTop(page)).toBe(0);
  await page.locator("aside").getByRole("link", { name: "Commentary" }).first().click();
  await expect(page).toHaveURL(/with=Commentary(\+|%20)ConnectionsList/);
  await expect.poll(() => bodyTop(page)).toBe(300);
  await page.locator("aside").getByRole("link", { name: "Resources" }).first().click();
  await expect(page).toHaveURL(/with=all/);
  await expect.poll(() => bodyTop(page)).toBe(0);
  await page.locator("aside").getByRole("link", { name: /^Commentary/ }).first().click();
  await expect(page).toHaveURL(/with=Commentary(\+|%20)ConnectionsList/);
  await expect.poll(() => bodyTop(page)).toBe(0);
});
