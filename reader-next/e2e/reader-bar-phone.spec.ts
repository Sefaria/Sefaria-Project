import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/*
 * The reader's bar, measured on www.sefaria.org (2026-11-18, Playwright, Genesis 1 bilingual, 375x812 phone and 1280 desktop):
 *  - a phone pads the bar 15px at both ends (.singlePanel .readerControls .readerControlsInner); its menu button is a 40x56 target 6px
 *    down with the bold fa-bars glyph at its start, #666; the bookmark's icon at 302,24 and the A at 339,24;
 *  - the Hebrew interface nudges the buttons (s2.css: .interface-hebrew .rightButtons margin-left -3px, .readerOptions
 *    margin-inline-end 11px, .int-he margin-left 8px): at 375 the א at 31 and the bookmark at 63, the menu button at 318 (its glyph
 *    at 337); on a 1280 desktop panel the א at 306 and the bookmark at 338.
 */
const box = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((e) => {
    const b = e.getBoundingClientRect();
    return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  });
const MENU = '[data-panel-id] header [aria-controls="mobile-nav"]';
const SAVE = "[data-panel-id] header button[aria-pressed] img, [data-panel-id] header button[class*='save'] img";
const OPTIONS = "[data-panel-id] header button[data-tooltip][aria-haspopup] img, [data-panel-id] header button[class*='options'] img";
const hebrew = (page: Page) => page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);

test.describe("the reader's bar on a phone", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only"));

  // @feature SHL-062 @feature GUI-001
  test("English: 15px in at both ends, the menu target 40x56 with the bold glyph @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, "/Genesis.1?lang=bi");
    expect(await box(page, MENU)).toEqual([15, 6, 40, 56]);
    expect(await box(page, `${MENU} svg`)).toEqual([15, 24, 21, 17]);
    expect(await page.locator(MENU).evaluate((e) => getComputedStyle(e).color)).toBe("rgb(102, 102, 102)");
    expect((await box(page, SAVE)).slice(0, 2)).toEqual([302, 24]);
    expect((await box(page, OPTIONS)).slice(0, 2)).toEqual([339, 24]);
  });

  // @feature SHL-062 @feature GUI-001
  test("Hebrew: the buttons nudged as sefaria.org's Hebrew interface @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await hebrew(page);
    await open(page, "/Genesis.1?lang=bi");
    expect(await box(page, MENU)).toEqual([318, 6, 40, 56]);
    expect((await box(page, `${MENU} svg`))[0]).toBe(337);
    expect((await box(page, OPTIONS)).slice(0, 2)).toEqual([31, 23]);
    expect((await box(page, SAVE)).slice(0, 2)).toEqual([63, 24]);
  });
});

// @feature SHL-062
test("the Hebrew interface's bar on a desktop panel: the א and the bookmark where sefaria.org puts them", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 1280, height: 900 });
  await hebrew(page);
  await open(page, "/Genesis.1?lang=bi");
  expect((await box(page, OPTIONS))[0]).toBe(306);
  expect((await box(page, SAVE))[0]).toBe(338);
});
