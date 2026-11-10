import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// Layout of the reading surface against www.sefaria.org (wave-3 parity report v-parity.md, S4 S5 S6 S7). The numbers in the comments
// were measured on www.sefaria.org on 2026-11-10 (reports/w4-b-surface.md).
const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height }; });
const scrollerTop = (page: Page) => page.locator("[data-reader-scroller]").evaluate((e) => e.getBoundingClientRect().top);

// @feature TXD-054
test("a chapter opens on its own title, not on the end of the previous chapter (parity S4)", async ({ page }) => {
  await open(page, "/Psalms.119?lang=he");
  // Psalm 118 loads above without moving anything; the first screen still starts at "119" (legacy: its title 33px under the bar)
  await expect(page.locator('section[data-ref="Psalms 118"]')).toBeAttached({ timeout: 25_000 });
  const top = await scrollerTop(page);
  const title = await box(page, 'section[data-ref="Psalms 119"] h2');
  expect(title.top - top).toBeGreaterThanOrEqual(0);
  expect(title.top - top).toBeLessThan(45);
  const prev = await box(page, 'section[data-ref="Psalms 118"]');
  expect(prev.bottom).toBeLessThanOrEqual(top + 1);
});

// @feature TXD-054 @feature TXD-056
test("the book's first chapter opens scrolled past the book title strip, as sefaria.org (parity S4)", async ({ page }) => {
  await open(page, "/Genesis.1?lang=bi");
  const top = await scrollerTop(page);
  const title = await box(page, 'section[data-ref="Genesis 1"] h2');
  expect(title.top - top).toBeGreaterThanOrEqual(0);
  expect(title.top - top).toBeLessThan(45);
});

// @feature TXD-043
test("stacked bilingual: 10px from the Hebrew to the English, 20px to the next verse, Hebrew right-aligned (parity S5)", async ({ page }) => {
  await open(page, "/Genesis.1?lang=bi");
  const m = await page.evaluate(() => {
    const seg = (r: string) => document.querySelector<HTMLElement>(`[role="group"][data-ref="${r}"]`)!;
    const he = seg("Genesis 1:1").querySelector<HTMLElement>('[data-side="primary"]')!;
    const en = seg("Genesis 1:1").querySelector<HTMLElement>('[data-side="translation"]')!;
    return {
      gap: en.getBoundingClientRect().top - he.getBoundingClientRect().bottom,
      next: seg("Genesis 1:2").getBoundingClientRect().top - seg("Genesis 1:1").getBoundingClientRect().bottom,
      // one line of Hebrew: the enlarged first letter must not make the line taller (live 42.9px for a 42.944px line)
      heHeight: he.getBoundingClientRect().height,
      heLine: parseFloat(getComputedStyle(he).lineHeight),
      align: getComputedStyle(he).textAlign,
    };
  });
  expect(m.gap).toBeCloseTo(10, 0);
  expect(m.next).toBeCloseTo(20, 0);
  expect(m.heHeight).toBeLessThan(m.heLine * 1.5);
  expect(m.align).toBe("right");
});

// @feature TXD-012
test("Hebrew daf headings read ב׳ א / ב׳ ב (parity S7)", async ({ page }) => {
  await open(page, "/Berakhot.2a?lang=he");
  await expect(page.locator('section[data-ref="Berakhot 2a"] h2')).toHaveText("ב׳ א");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true });
  // @feature TXD-046
  test("Hebrew-only Talmud (continuous) does not scroll sideways at 320px (parity S6)", async ({ page }) => {
    await open(page, "/Berakhot.2a?lang=he");
    await expect(page.locator('[role="group"][data-ref="Berakhot 2a:6"]')).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(500); // the numbers are spread after the fonts arrive
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(w.scroll).toBeLessThanOrEqual(w.client);
  });
});
