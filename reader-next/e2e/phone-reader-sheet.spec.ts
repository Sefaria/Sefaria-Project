import { expect, test, type Page } from "@playwright/test";
import { covering, open } from "./helpers";

/*
 * A verse tapped on a phone opens the resources sheet over the bottom of the screen. Measured on www.sefaria.org (2026-11-18,
 * Playwright, Genesis 1 bilingual, at 320x568, 375x812 and 412x915): the tapped verse goes to 134px from the top of the screen,
 * above the sheet, wherever it was, and the reader's top bar is not shown while the sheet is open (ReaderPanel leaves ReaderControls
 * out in its phone mode TextAndConnections; TextColumn.scrollToHighlighted). Tapping the verse again closes the sheet: the bar comes
 * back and the verse stays where it is.
 */
const seg = (page: Page, ref: string) => page.locator(`[role="group"][data-ref="${ref}"]`).first();
const top = async (page: Page, ref: string) => Math.round((await seg(page, ref).boundingBox())!.y);
const bar = (page: Page) => page.locator("[data-panel-id] header").first();
const sheet = (page: Page) => page.locator('[data-panel-id][data-has-aside="true"]');

async function verseAt(page: Page, ref: string, y: number) {
  const b = (await seg(page, ref).boundingBox())!;
  await page.evaluate((d) => window.scrollBy(0, d), b.y - y);
  await expect.poll(() => top(page, ref)).toBe(y);
}

test.describe("the resources sheet on a phone", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only"));

  // @feature CON-009 @feature SHL-061
  test("a tapped verse goes to 134px from the top, above the sheet, and the reader's bar gives way @mobile", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await expect(seg(page, "Genesis 1:3")).toBeVisible();
    await expect(bar(page)).toBeVisible();
    // low on the screen, where the sheet will be
    await verseAt(page, "Genesis 1:3", 560);
    await seg(page, "Genesis 1:3").tap({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/Genesis\.1\.3\?lang=bi&with=all$/);
    await expect(sheet(page)).toHaveCount(1);
    await expect.poll(() => top(page, "Genesis 1:3")).toBe(134);
    await expect(bar(page)).toBeHidden();
    // the verse takes a tap where it now is (nothing over it)
    expect(await covering(page, `[document.querySelector('[role="group"][data-ref="Genesis 1:3"]')]`)).toEqual([null]);
  });

  // @feature CON-009 @feature SHL-061
  test("tapping the verse again closes the sheet: the bar comes back and the verse stays where it is @mobile", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await verseAt(page, "Genesis 1:3", 300);
    await seg(page, "Genesis 1:3").tap({ position: { x: 20, y: 10 } });
    await expect.poll(() => top(page, "Genesis 1:3")).toBe(134);
    await seg(page, "Genesis 1:3").tap({ position: { x: 20, y: 10 } });
    await expect(sheet(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    await expect(page).toHaveURL(/\/Genesis\.1\.3\?lang=bi/);
    expect(await top(page, "Genesis 1:3")).toBe(134);
  });

  // @feature CON-009
  test("with the sheet open, another verse tapped above it goes to the same place @mobile", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await verseAt(page, "Genesis 1:4", 300);
    await seg(page, "Genesis 1:4").tap({ position: { x: 20, y: 10 } });
    await expect.poll(() => top(page, "Genesis 1:4")).toBe(134);
    // Genesis 1:3 ends just above it
    const b = (await seg(page, "Genesis 1:3").boundingBox())!;
    expect(b.y + b.height).toBeGreaterThan(20);
    await page.touchscreen.tap(b.x + 20, Math.max(5, b.y + b.height - 15));
    await expect(page).toHaveURL(/\/Genesis\.1\.3\?lang=bi&with=all$/);
    await expect.poll(() => top(page, "Genesis 1:3")).toBe(134);
    await expect(bar(page)).toBeHidden();
  });

  // @feature CON-009
  test("the sheet's Close brings the bar back and leaves the verse where it is @mobile", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await verseAt(page, "Genesis 1:3", 300);
    await seg(page, "Genesis 1:3").tap({ position: { x: 20, y: 10 } });
    await expect.poll(() => top(page, "Genesis 1:3")).toBe(134);
    await sheet(page).getByRole("button", { name: "Close", exact: true }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    expect(await top(page, "Genesis 1:3")).toBe(134);
  });
});

/*
 * The translation suggestion ("Want to change the translation?") on a phone: sefaria.org keeps it under the reader's bar, 60px from
 * the top, as the page scrolls (it is inside the fixed .readerControlsOuter; measured 2026-11-18 at 375x812), and leaves it out with
 * the bar while the sheet is open. Here it was in the page above the text, so the opening scroll took it off the screen at once.
 */
test.describe("the translation suggestion on a phone", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only"));

  // @feature SHL-061
  test("stays under the reader's bar as the page scrolls, its buttons take a tap, and it gives way to the sheet @mobile", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    const go = page.getByRole("button", { name: "Go to translations" });
    const banner = page.getByRole("region", { name: "Suggestion" });
    await expect(go).toBeVisible();
    const at = async () => Math.round((await banner.boundingBox())!.y);
    expect(await at()).toBe(60);
    await page.evaluate(() => window.scrollBy(0, 1200));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    expect(await at()).toBe(60);
    expect(await covering(page, `[...document.querySelectorAll('[aria-label="Suggestion"] button')]`)).toEqual([null, null]);
    // the sheet open: the banner gives way with the bar
    await verseAt(page, "Genesis 1:3", 300);
    await seg(page, "Genesis 1:3").tap({ position: { x: 20, y: 10 } });
    await expect(sheet(page)).toHaveCount(1);
    await expect(go).toBeHidden();
  });
});
