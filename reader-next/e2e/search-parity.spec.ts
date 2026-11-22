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

// The design review (2026-11-22) asked for the search pages as they are on sefaria.org. Its SearchResultCard (s2.css
// .searchResultCard-versions*): "N more versions" opens the other versions as #fafafa boxes 12px inside, 16px apart, each one link
// (no rule beside them, nothing underlined); the card's bar is drawn in the book's colour.
test("desktop: the other versions open as grey boxes, as sefaria.org", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/search?q=light&tab=text");
  const more = page.getByRole("button", { name: /more versions/ }).first();
  await expect(more).toBeVisible({ timeout: 20_000 });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const card = page.locator("article").first();
  const items = card.locator("a[class*='_versionItem_']");
  await expect(items.first()).toBeVisible();
  expect(await css(items.first(), "background-color")).toBe("rgb(250, 250, 250)");
  expect(await css(items.first(), "padding")).toBe("12px");
  expect(await css(items.first(), "text-decoration-line")).toBe("none");
  const [a, b] = [(await items.nth(0).boundingBox())!, (await items.nth(1).boundingBox())!];
  expect(Math.round(b.y - (a.y + a.height))).toBe(16);
  expect(await css(items.first().locator(".."), "border-inline-start-width")).toBe("0px");
});

// sefaria.org's HeaderAutocomplete (s2.css .autocomplete-dropdown): right under the header, a group per kind with its name in a column
// on the start side (Roboto 14px #999, not capitals), the rows serif 18px, the highlighted one on #ededec.
test("desktop: the header's suggestions as sefaria.org's dropdown", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/name/**", (route) => route.fulfill({ path: "fixtures/api/search/name-gen.json", headers: { "access-control-allow-origin": "*" } }));
  await open(page, "/texts");
  const box = page.getByRole("combobox", { name: "Search for Texts or Keywords Here" });
  await box.click();
  await box.pressSequentially("gen", { delay: 50 });
  const list = page.getByRole("listbox", { name: "Suggestions" });
  await expect(list).toBeVisible();
  expect(await y(list)).toBe(60);
  const topics = list.getByRole("group", { name: "Topics" });
  const title = topics.getByText("Topics", { exact: true });
  expect(await css(title, "font-family")).toMatch(/^Roboto/);
  expect(await css(title, "font-size")).toBe("14px");
  expect(await css(title, "text-transform")).toBe("none");
  expect(await css(title, "color")).toBe("rgb(153, 153, 153)");
  // the rows sit to the side of the group's name, not under it
  const first = topics.getByRole("option").first();
  expect((await first.boundingBox())!.x).toBeGreaterThan((await title.boundingBox())!.x + 40);
  expect(Math.abs((await first.boundingBox())!.y - (await title.boundingBox())!.y)).toBeLessThan(12);
  await box.press("ArrowDown");
  await box.press("ArrowDown");
  expect(await css(list.getByRole("option").nth(1).locator("span").first(), "background-color")).toBe("rgb(237, 237, 236)");
  expect(await css(list.getByRole("option").nth(1).locator("span").first(), "font-size")).toBe("18px");
});

// On a phone (s2.css @media max-width 842px) the list runs across the screen under the menu's box, at 120px, without the groups' names.
test("phone: the menu's suggestions across the screen, without group names @mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
  await page.route("**/api/name/**", (route) => route.fulfill({ path: "fixtures/api/search/name-gen.json", headers: { "access-control-allow-origin": "*" } }));
  await open(page, "/texts");
  await page.getByRole("button", { name: /menu/i }).first().tap();
  const box = page.getByRole("combobox", { name: "Search for Texts or Keywords Here" }).filter({ visible: true });
  await box.tap();
  await box.pressSequentially("gen", { delay: 50 });
  const list = page.getByRole("listbox", { name: "Suggestions" }).filter({ visible: true });
  await expect(list).toBeVisible();
  const r = (await list.boundingBox())!;
  expect(Math.round(r.y)).toBe(120);
  expect(Math.round(r.x)).toBe(0);
  expect(Math.round(r.width)).toBe(page.viewportSize()!.width);
  await expect(list.getByText("Topics", { exact: true })).toBeHidden();
  expect(await css(list.getByRole("option").first(), "border-top-width")).not.toBe("0px");
});
