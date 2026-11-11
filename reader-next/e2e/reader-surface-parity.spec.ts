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

/** Number glyphs (their text, not their 30px box) that touch any line of verse text, and numbers whose boxes touch each other. */
const NUMBERS_ON_TEXT = () => {
  const lines: DOMRect[] = [];
  for (const side of document.querySelectorAll('[role="group"][data-ref] [data-side]')) {
    const r = document.createRange();
    r.selectNodeContents(side);
    for (const b of r.getClientRects()) if (b.width > 1 && b.height > 1) lines.push(b);
  }
  const hits: string[] = [];
  for (const n of document.querySelectorAll<HTMLElement>('[role="group"][data-ref] [data-number]')) {
    const g = document.createRange();
    g.selectNodeContents(n);
    const b = g.getBoundingClientRect();
    if (lines.some((t) => b.left < t.right - 0.5 && b.right > t.left + 0.5 && b.top < t.bottom - 0.5 && b.bottom > t.top + 0.5)) hits.push(n.closest<HTMLElement>("[data-ref]")!.dataset.ref!);
  }
  // and numbers on numbers: their whole boxes (30px wide, one number line tall), pairwise
  const nums = [...document.querySelectorAll<HTMLElement>('[role="group"][data-ref] [data-number]')].map((n) => ({ ref: n.closest<HTMLElement>("[data-ref]")!.dataset.ref!, b: n.getBoundingClientRect() }));
  const clashes: string[] = [];
  nums.forEach((x, i) => nums.slice(i + 1).forEach((y) => {
    if (x.b.left < y.b.right - 0.5 && x.b.right > y.b.left + 0.5 && x.b.top < y.b.bottom - 0.5 && x.b.bottom > y.b.top + 0.5) clashes.push(`${x.ref} / ${y.ref}`);
  }));
  return { hits, clashes, stepped: [...document.querySelectorAll<HTMLElement>("[data-number]")].filter((n) => n.style.translate).length, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth };
};

test.describe("on a phone", () => {
  test.use({ viewport: { width: 320, height: 700 }, hasTouch: true, isMobile: true });
  // @feature TXD-046 @feature TXD-045
  // Berakhot 2a (Talmud, continuous in one language) and I Chronicles 1 in continuous layout, whose one-name verses put three and more
  // verse starts on a line: numbers stepped down could reach the next line's number (final-check nit)
  const CASES = [
    ...(["he", "en", "bi"] as const).map((lang) => ({ name: `Talmud ${lang}`, path: `/Berakhot.2a?lang=${lang}`, last: "Berakhot 2a:6", continuousTanakh: false, mustStep: lang === "he" })),
    ...(["he", "en"] as const).map((lang) => ({ name: `I Chronicles 1 continuous ${lang}`, path: `/I_Chronicles.1?lang=${lang}`, last: "I Chronicles 1:8", continuousTanakh: true, mustStep: lang === "he" })),
  ];
  for (const c of CASES) {
    test(`${c.name}: no sideways scroll, no verse number on the text or on another number, at 320-414px (parity S6, review nits)`, async ({ page }) => {
      if (c.continuousTanakh) await page.context().addCookies([{ name: "layoutTanakh", value: "continuous", domain: "localhost", path: "/" }]);
      let stepped = 0;
      for (const width of [320, 360, 390, 414]) {
        await page.setViewportSize({ width, height: 700 });
        await open(page, c.path);
        await expect(page.locator(`[role="group"][data-ref="${c.last}"]`)).toBeVisible({ timeout: 25_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300); // the numbers are spread after the fonts arrive
        const m = await page.evaluate(NUMBERS_ON_TEXT);
        expect(m.scroll, `${width}px`).toBeLessThanOrEqual(m.client);
        expect(m.hits, `${width}px: numbers on the text`).toEqual([]);
        expect(m.clashes, `${width}px: numbers on numbers`).toEqual([]);
        stepped += m.stepped;
      }
      // several segments begin on one line here: the spreading really ran
      if (c.mustStep) expect(stepped).toBeGreaterThan(0);
    });
  }
  test("Hebrew interface, Hebrew Talmud at 320px: no sideways scroll, no number on the text", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/Berakhot.2a?lang=he");
    await expect(page.locator('[role="group"][data-ref="Berakhot 2a:6"]')).toBeVisible({ timeout: 25_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const m = await page.evaluate(NUMBERS_ON_TEXT);
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    expect(m.hits).toEqual([]);
    expect(m.clashes).toEqual([]);
  });
});
