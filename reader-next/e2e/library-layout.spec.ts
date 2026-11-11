import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// The library pages' frame in a narrow desktop window. sefaria.org's .sidebarLayout keeps the sidebar beside the page down to 701px, both
// columns shrinking with the window in the ratio of their inner widths; neither goes under its own min-content (the library home's
// sidebar stops at 309px, its "Get Started" button). The topic page's .columnLayout does the same with 680 : 420. Widths measured on
// sefaria.org at 800px, English and Hebrew.

/** The sidebar's box and the page column's inner width (its width without its padding). */
async function columns(page: Page) {
  return page.locator("main aside").first().evaluate((side) => {
    const col = side.previousElementSibling as HTMLElement;
    const s = side.getBoundingClientRect(), c = col.getBoundingClientRect(), cs = getComputedStyle(col);
    return { sideX: Math.round(s.x), sideY: Math.round(s.y), sideW: Math.round(s.width), colY: Math.round(c.y), colInner: Math.round(c.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), scrollW: document.documentElement.scrollWidth };
  });
}

// @feature LIB-023
test.describe("library pages at 800px", () => {
  test.use({ viewport: { width: 800, height: 900 } });
  const pages = [
    { path: "/texts", heading: "Browse the Library", side: 309, col: 431 },
    { path: "/texts/Tanakh", heading: "Tanakh", side: 286, col: 454 },
    { path: "/topics/moses", heading: "Moses", side: 275, col: 445 },
  ];
  for (const p of pages) {
    test(`${p.path}: the sidebar beside the page, ${p.side}px wide, the page column ${p.col}px`, async ({ page }) => {
      await open(page, p.path);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      const m = await columns(page);
      expect(Math.abs(m.sideY - m.colY)).toBeLessThanOrEqual(100); // side by side, from the top of the page (the topic page's grey reaches 80px higher)
      expect(m.sideX + m.sideW).toBe(800); // at the window's edge
      expect(Math.abs(m.sideW - p.side)).toBeLessThanOrEqual(2);
      expect(Math.abs(m.colInner - p.col)).toBeLessThanOrEqual(2);
      expect(m.scrollW).toBe(800); // nothing runs past the window
    });
  }
  test("Hebrew interface, /texts/Tanakh: the same widths, the sidebar on the left", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/texts/Tanakh");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const m = await columns(page);
    expect(Math.abs(m.sideY - m.colY)).toBeLessThanOrEqual(100);
    expect(m.sideX).toBe(0);
    expect(Math.abs(m.sideW - 286)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.colInner - 454)).toBeLessThanOrEqual(2);
  });
});

// @feature LIB-023
test("/texts/Tanakh at 700px: one column, the sidebar under the page", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await open(page, "/texts/Tanakh");
  await expect(page.getByRole("heading", { level: 1, name: "Tanakh" })).toBeVisible();
  const m = await columns(page);
  expect(m.sideW).toBe(700);
  expect(m.sideY).toBeGreaterThan(m.colY + 500);
});
