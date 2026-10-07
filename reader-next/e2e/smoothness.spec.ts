import { expect, test, type Page } from "@playwright/test";
import { open, segmentTop } from "./helpers";

/**
 * Smoothness regressions. A reader sees a "jump" whenever a verse moves on screen by anything other than their
 * own scrolling. For each wheel step we compare the verse's movement with the reader's own scroll (the scroll
 * position change minus the engine's deliberate corrections, which the engine reports in development).
 * @feature TXD-052 @feature TXD-053 @feature TXD-055 @feature TXD-068
 */
async function measureJumps(page: Page, verse: string, plan: [direction: 1 | -1, steps: number][], step: number, wait: number) {
  // Measured just after a frame is painted: measuring at any other moment forces a layout the engine has not
  // corrected yet (its ResizeObserver runs before paint), i.e. a state the reader never sees.
  const sample = () =>
    page.evaluate(async (v) => {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const c = document.querySelector("[data-reader-scroller]") as HTMLElement;
      const scroller = ["auto", "scroll"].includes(getComputedStyle(c).overflowY) ? c : document.scrollingElement!;
      const rs = (window as unknown as { __readingScroll?: { corrections: number[] } }).__readingScroll;
      const corr = rs ? rs.corrections.splice(0).reduce((a, b) => a + b, 0) : 0;
      return { top: document.querySelector(`[role="group"][data-ref="${v}"]`)!.getBoundingClientRect().top, st: scroller.scrollTop, corr };
    }, verse);
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
  await sample();
  const jumps: string[] = [];
  for (const [dir, n] of plan) {
    for (let i = 0; i < n; i++) {
      const a = await sample();
      await page.mouse.wheel(0, dir * step);
      await page.waitForTimeout(wait);
      const b = await sample();
      const own = b.st - a.st - b.corr;
      const moved = b.top - a.top;
      if (Math.abs(moved + own) > 1.5) jumps.push(`moved ${moved.toFixed(1)} vs own scroll ${own.toFixed(1)}`);
    }
  }
  return jumps;
}

test("reading up through a section boundary and back down never jumps", async ({ page }) => {
  await open(page, "/Genesis.2.3?lang=en");
  await page.waitForTimeout(1000);
  expect(await measureJumps(page, "Genesis 2:3", [[-1, 30], [1, 60]], 100, 60)).toEqual([]);
});

test("fast flinging through several prepends and appends never jumps", async ({ page }) => {
  await open(page, "/Genesis.5.10?lang=en");
  await page.waitForTimeout(1000);
  expect(await measureJumps(page, "Genesis 5:10", [[-1, 6], [1, 10]], 800, 30)).toEqual([]);
});

test("Talmud in continuous layout never jumps", async ({ page }) => {
  await open(page, "/Berakhot.3a.5?lang=he");
  await page.waitForTimeout(1000);
  expect(await measureJumps(page, "Berakhot 3a:5", [[-1, 25], [1, 40]], 120, 60)).toEqual([]);
});

test.describe("your place is kept when the layout changes", () => {
  const near = async (page: Page, ref: string, action: () => Promise<void>) => {
    const before = await segmentTop(page, ref);
    await action();
    await page.waitForTimeout(600);
    return Math.abs((await segmentTop(page, ref)) - before);
  };

  test("opening and closing the sidebar", async ({ page }) => {
    await open(page, "/Genesis.1.10?lang=bi");
    // Click where a reader would (Playwright's own click would first scroll the whole verse into view).
    const box = await page.locator('[role="group"][data-ref="Genesis 1:12"]').boundingBox();
    expect(await near(page, "Genesis 1:12", () => page.mouse.click(box!.x + 100, box!.y + 20))).toBeLessThan(2);
    expect(await near(page, "Genesis 1:12", () => page.getByRole("button", { name: "Close", exact: true }).click())).toBeLessThan(2);
  });

  test("changing the font size", async ({ page }) => {
    await open(page, "/Genesis.1.20?lang=en");
    await page.getByRole("button", { name: "Text display options" }).click();
    expect(await near(page, "Genesis 1:20", async () => {
      await page.getByRole("button", { name: "Larger text" }).click();
      await page.getByRole("button", { name: "Larger text" }).click();
    })).toBeLessThan(2);
  });

  test("switching to source and translation together", async ({ page }) => {
    await open(page, "/Genesis.1.20?lang=en");
    await page.getByRole("button", { name: "Text display options" }).click();
    expect(await near(page, "Genesis 1:20", () => page.getByRole("radio", { name: "Source with Translation" }).click())).toBeLessThan(2);
  });

  test("opening a footnote above where you are reading", async ({ page }) => {
    await open(page, "/Genesis.1.4?lang=en");
    await page.locator('[data-reader-scroller]').evaluate((el) => (el.scrollTop += 120)); // 1:1's footnote is now above the reading line
    await page.waitForTimeout(300);
    // Clicked in place (it is above the fold; Playwright's click would scroll it into view first).
    const marker = page.locator('[data-ref="Genesis 1:1"] [data-note]').first();
    expect(await near(page, "Genesis 1:4", () => marker.evaluate((el: HTMLElement) => el.click()))).toBeLessThan(2);
  });
});

test("scrolling down never moves the address bar backwards (end of a chapter)", async ({ page }) => {
  await open(page, "/Genesis.1.30?lang=en");
  const seen: string[] = [];
  page.on("framenavigated", (f) => f === page.mainFrame() && seen.push(new URL(f.url()).pathname));
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(300);
  const order = (p: string) => p.split(".").slice(1).map(Number).reduce((a, n) => a * 1000 + n, 0);
  const urls = seen;
  for (let i = 1; i < urls.length; i++) expect(order(urls[i]!), `${urls[i - 1]} → ${urls[i]}`).toBeGreaterThanOrEqual(order(urls[i - 1]!));
  expect(urls.at(-1)).toMatch(/^\/Genesis\.2\./);
});

test("no layout shift on arrival", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await open(page, "/Genesis.2.3?lang=en");
  await page.waitForTimeout(2000);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.05);
});
