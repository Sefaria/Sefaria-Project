import { expect, test, type Locator, type Page } from "@playwright/test";
import { open } from "./helpers";

/*
 * The sidebar's lists, measured on www.sefaria.org (2026-11-18, Playwright, Genesis 1:3, at 375x812 and 1280):
 *  - a connected text in Hebrew is 21.96px on a 30.744px line (122% of 18px), black; "Open" Roboto 13px #666;
 *  - on a phone the commentary list sits 45px in from both edges and a text starts 6px under its source line;
 *  - a tool's text is 15px after its 18px icon; the EN tag 12px; on a phone the sheet's "Resources" is centred on the whole bar.
 */
const css = (l: Locator, p: string) => l.evaluate((e, prop) => getComputedStyle(e).getPropertyValue(prop), p);
const rect = (l: Locator) => l.evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
const aside = (page: Page) => page.locator('[data-panel-id] aside, [data-panel-id] [class*="_aside_"]').first();

// @feature CON-030 @feature CON-002
test("a Hebrew connected text is the reader's Hebrew size, black; Open is 13px #666", async ({ page }) => {
  await open(page, "/Genesis.1.1?with=Rashi&lang=he");
  const he = aside(page).locator('li[data-lang="he"]').first();
  await expect(he).toBeVisible({ timeout: 20_000 });
  expect(await css(he, "font-size")).toBe("21.96px");
  expect(await css(he, "line-height")).toBe("30.744px");
  expect(await css(he.locator("p").first(), "color")).toBe("rgb(0, 0, 0)");
  const openLink = aside(page).getByRole("link", { name: /Open/ }).first();
  expect(await css(openLink, "font-size")).toBe("13px");
  expect(await css(openLink, "color")).toBe("rgb(102, 102, 102)");
});

// @feature CON-001
test("a tool's text is 15px after its icon, and the EN tag is 12px", async ({ page }) => {
  await open(page, "/Genesis.1.3?lang=bi&with=all");
  const tool = aside(page).locator("[data-tool]").first();
  await expect(tool).toBeVisible({ timeout: 20_000 });
  const icon = await rect(tool.locator("svg, img").first());
  const label = await rect(tool.locator("[class*='label']").first());
  expect(Math.round(label.x - (icon.x + icon.width))).toBe(15);
  const tag = aside(page).locator("[class*='_tag_']").first();
  expect(await css(tag, "font-size")).toBe("12px");
});

test.describe("on a phone", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only"));

  // @feature CON-009 @feature CON-002
  test("the commentary list sits 45px in, each text 6px under its source @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // where sefaria.org was measured
    await open(page, "/Genesis.1.1?lang=bi&with=Commentary");
    const item = aside(page).locator("ul li:has([class*='_ref_'])").first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    const vw = page.viewportSize()!.width;
    const b = await rect(item);
    expect([Math.round(b.x), Math.round(vw - b.x - b.width)]).toEqual([45, 45]);
    const ref = await rect(item.locator("[class*='_ref_']").first());
    const text = await rect(item.locator("p").first());
    // 6px on sefaria.org's rounded boxes (the line boxes are fractional: 5.x here); it was 1px
    const gap = text.y - (ref.y + ref.height);
    expect(gap).toBeGreaterThanOrEqual(5);
    expect(gap).toBeLessThan(7);
  });

  // @feature CON-002
  test("the sheet's Resources is centred on the whole bar, beside its Close @mobile", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=bi&with=all");
    const title = aside(page).locator("h2").first();
    await expect(title).toBeVisible({ timeout: 20_000 });
    const t = await title.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return b.x + b.width / 2; });
    expect(Math.abs(t - page.viewportSize()!.width / 2)).toBeLessThanOrEqual(2);
    await expect(aside(page).getByRole("button", { name: "Close", exact: true })).toBeVisible();
  });
});
