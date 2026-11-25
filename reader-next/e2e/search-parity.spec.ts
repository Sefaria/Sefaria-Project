import { expect, test, type Locator, type Page } from "@playwright/test";
import { open } from "./helpers";

/*
 * The search page against sefaria.org (2026-11-18, Playwright, /search?q=light, 1280x900 and 375x900; s2.css .searchContent):
 *  - the bar 45px tall at 120 (85 on a phone), the tabs 20px under it; desktop the 76px row of the toggle and the sort right under
 *    the tabs, the first result at 312; a phone's strip, 18px, then the 76px row with the filter button 18px into it (at 240);
 *  - All Results / Exact Phrase: Roboto 14px in a 216px pill, the chosen one 600; the sort Roboto 16px #575757; a tab's count Roboto
 *    12px #666; a result's version Roboto 12px #707070; "Filters" 22px #666; the filter box 10px under it.
 */
const css = (l: Locator, p: string) => l.evaluate((e, prop) => getComputedStyle(e).getPropertyValue(prop), p);
const y = async (l: Locator) => Math.round((await l.boundingBox())!.y);
const bar = (page: Page) => page.locator("[data-search-page-bar]");

test("desktop: the bar, the tabs, the sort row and the first result where sefaria.org puts them, in its fonts", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/search?q=light&tab=text");
  const allResults = page.getByRole("button", { name: "All Results" });
  await expect(allResults).toBeVisible({ timeout: 20_000 });
  expect(await y(bar(page))).toBe(120);
  expect((await bar(page).boundingBox())!.height).toBe(45);
  expect(await y(page.getByRole("navigation", { name: "Result types" }))).toBe(185);
  expect(await css(allResults, "font-family")).toMatch(/^Roboto/);
  expect(await css(allResults, "font-size")).toBe("14px");
  expect(await css(allResults.locator(".."), "width")).toBe("216px");
  const sort = page.getByRole("button", { name: /^Sort by/ });
  expect(await css(sort, "font-family")).toMatch(/^Roboto/);
  expect(await css(sort, "color")).toBe("rgb(87, 87, 87)");
  const count = page.getByRole("navigation", { name: "Result types" }).locator("a span").last();
  expect(await css(count, "font-size")).toBe("12px");
  const filters = page.getByRole("heading", { name: "Filters" });
  expect(await css(filters, "font-size")).toBe("22px");
  expect(await css(filters, "color")).toBe("rgb(102, 102, 102)");
  const box = page.getByPlaceholder(/filter/i);
  const h = (await filters.boundingBox())!;
  expect(Math.round((await box.boundingBox())!.y - (h.y + h.height))).toBe(10);
  const version = page.locator("[class*='_version_']").first();
  expect(await css(version, "font-size")).toBe("12px");
  expect(await css(version, "color")).toBe("rgb(112, 112, 112)");
});

// @feature SRC-062 @feature SRC-063
test("phone: the strip, then the filter button 18px into its 76px row; the panel's toggle and headings as sefaria.org @mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
  await page.setViewportSize({ width: 375, height: 900 });
  await open(page, "/search?q=light&tab=text");
  const filterBtn = page.getByRole("button", { name: "Sort & filter results" });
  await expect(filterBtn).toBeVisible({ timeout: 20_000 });
  expect(await y(bar(page))).toBe(85);
  expect(await y(page.getByRole("tablist", { name: "Result types" }))).toBe(150);
  expect(await y(filterBtn)).toBe(240);
  await filterBtn.tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const toggle = dialog.getByRole("button", { name: "All Results" });
  expect(await css(toggle, "font-family")).toMatch(/^Roboto/);
  expect(await css(toggle, "font-size")).toBe("14px");
  const searchType = dialog.getByRole("heading", { name: "Search Type" });
  expect(await css(searchType, "font-size")).toBe("22px");
  expect(await y(searchType)).toBe(79);
  expect(await css(dialog.getByText("Relevance", { exact: true }), "font-size")).toBe("16px");
});
