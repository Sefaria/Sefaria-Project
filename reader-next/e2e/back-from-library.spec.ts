import { expect, test, type Page } from "@playwright/test";
import { open, segmentTop } from "./helpers";

/** "/Genesis.2.2?lang=bi" → "Genesis 2:2" */
const refOfPath = (url: string) => {
  const parts = new URL(url).pathname.slice(1).split(".");
  return `${parts[0]!.replace(/_/g, " ")} ${parts.slice(1).join(":")}`;
};

/** The verse the reading engine holds as current (development builds expose its state). */
const focusVerse = (page: Page) => page.evaluate(() => (window as unknown as { __readingScroll?: { focus?: string } }).__readingScroll?.focus ?? "");

/** Read a little, leave the reader for a library page by an in-app link, come Back: the verse is where it was. */
async function leaveAndComeBack(page: Page) {
  await open(page, "/Genesis.1.20?lang=bi");
  await page.waitForTimeout(800);
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
  }
  // Losing the place would put the address's verse on the reading line (140px under the column's top, +2): nudge on until the current
  // verse is clear of it, so a lost place shows.
  const line = box!.y + 142;
  let ref = await focusVerse(page);
  let before = await segmentTop(page, ref);
  for (let i = 0; i < 6 && Math.abs(before - line) <= 20; i++) {
    await page.mouse.wheel(0, 50);
    await page.waitForTimeout(500);
    ref = await focusVerse(page);
    before = await segmentTop(page, ref);
  }
  expect(Math.abs(before - line)).toBeGreaterThan(20);
  await expect.poll(() => refOfPath(page.url())).toBe(ref);
  await page.locator('a[href="/texts"]:visible').first().click();
  await expect(page).toHaveURL(/\/texts$/);
  await expect(page.locator("[data-reader-scroller]")).toHaveCount(0); // the reader has left the page (a quick Back could beat it)
  await page.goBack();
  await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(800);
  return { ref, before, after: await segmentTop(page, ref) };
}

// The reader's page is unmounted while a library page shows, so the arrival by Back has to be known without it. sefaria.org
// (measured 2026-11-12, Genesis 1:20 bilingual, 1280px, six wheel steps, Texts, Back) does not keep the place either: Genesis 2:1
// came back 164px lower than it was. Here the place is restored exactly (back/forward restore, as within the reader); before this
// fix the address's verse was put on the reading line instead, 98px off.
// @feature SHL-064 @feature SHL-065
test("Back from a library page puts the reader where they were", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
  const { ref, before, after } = await leaveAndComeBack(page);
  expect(Math.abs(after - before), `${ref}: ${before} before, ${after} after`).toBeLessThan(2);
});

// The same on a phone, where the page itself scrolls.
// @feature SHL-064 @feature SHL-065
test("Back from a library page puts the reader where they were, on a phone @mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
  await open(page, "/Genesis.1.20?lang=bi");
  await page.waitForTimeout(800);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(150);
  }
  await expect.poll(() => new URL(page.url()).pathname).not.toBe("/Genesis.1.20");
  await page.waitForTimeout(800);
  const ref = refOfPath(page.url());
  // on a phone the library link is in the menu; opening it shows the site header above the panel, and the place kept is the one on
  // screen when the reader leaves
  await page.getByRole("button", { name: "Menu" }).first().click();
  await page.waitForTimeout(300);
  const before = await segmentTop(page, ref);
  await page.locator('a[href="/texts"]:visible').first().click();
  await expect(page).toHaveURL(/\/texts$/);
  await expect(page.locator("[data-reader-scroller]")).toHaveCount(0); // the reader has left the page (a quick Back could beat it)
  await page.goBack();
  await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(800);
  const after = await segmentTop(page, ref);
  expect(Math.abs(after - before), `${ref}: ${before} before, ${after} after`).toBeLessThan(2);
});
