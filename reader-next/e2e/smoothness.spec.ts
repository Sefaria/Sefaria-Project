import { expect, test, type Page } from "@playwright/test";
import { open, segmentTop } from "./helpers";

/**
 * Smoothness regressions. A reader sees a "jump" whenever a verse moves on screen by anything other than their
 * own scrolling. For each wheel step we compare the verse's movement with the reader's own scroll: the scroll position change
 * minus the engine's deliberate corrections, which the engine reports in development; on a production build (no report), the
 * wheel step itself.
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
      const corr = rs ? rs.corrections.splice(0).reduce((a, b) => a + b, 0) : null;
      const clamped = scroller.scrollTop <= 0 || scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1;
      return { top: document.querySelector(`[role="group"][data-ref="${v}"]`)!.getBoundingClientRect().top, st: scroller.scrollTop, corr, clamped };
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
      const moved = b.top - a.top;
      if (b.corr !== null) {
        // development builds report the engine's deliberate corrections: the reader's own scroll is the rest
        const own = b.st - a.st - b.corr;
        if (Math.abs(moved + own) > 1.5) jumps.push(`moved ${moved.toFixed(1)} vs own scroll ${own.toFixed(1)}`);
      } else if (!b.clamped && Math.abs(moved + dir * step) > 1.5) {
        // a production build does not report them (CODE_REVIEW R-38 was this test reading their scrollTop change as a jump):
        // the verse must move by exactly the wheel step, unless scrolling stopped at an end
        jumps.push(`moved ${moved.toFixed(1)} for a wheel step of ${dir * step}`);
      }
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

/** The verse at the reading line, as the scroll engine has it (development builds expose its state). */
const readingVerse = (page: Page) => page.evaluate(() => (window as unknown as { __readingScroll?: { focus?: string } }).__readingScroll?.focus ?? "");

/** Zohar in English mode, opened on Bereshit 1: wheel down until the reading line is in Bereshit 2, then a little further. */
async function scrollIntoBereshit2(page: Page) {
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
  for (let i = 0; i < 80 && !(await readingVerse(page)).startsWith("Zohar, Bereshit 2:"); i++) {
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(80);
  }
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(300);
}

test("labels changing language as the reader scrolls into the next section never jump, in any frame", async ({ page }) => {
  // Zohar in English mode: Bereshit 1 is shown in its Hebrew Translation, so the column's headers and numbers are Hebrew; Bereshit 2
  // falls back to the English translation, so every label in the column turns English when the reading position enters it. The
  // headers change size then: the verse being read must not move, not even for one painted frame.
  await open(page, "/Zohar,_Bereshit.1?lang=en");
  await page.waitForTimeout(1000);
  const header = (ref: string) => page.locator(`section[data-ref="${ref}"] h2`);
  await expect(header("Zohar, Bereshit 1")).toHaveAttribute("lang", "he");
  // Every frame, at its start (before the engine's own frame step and its ResizeObserver): how far the verse at the reading line moved
  // since the frame before, against the reader's own scroll (the scroll change minus the engine's deliberate corrections, which
  // development builds report). The verse at the reading line is the one the engine keeps in place; at the boundary the header between
  // the last verse read and the next changes size, so the verse above the line may move. Stricter than the after-paint samples above
  // on purpose: the label switch must keep the verse in place in the same commit, so no state of the page, painted or measured, has
  // it moved.
  await page.evaluate(() => {
    type Rs = { focus?: string; corrections: number[] };
    const w = window as unknown as { __readingScroll?: Rs; __frames?: string[]; __tracing?: boolean };
    const c = document.querySelector("[data-reader-scroller]") as HTMLElement;
    const scroller = ["auto", "scroll"].includes(getComputedStyle(c).overflowY) ? c : document.scrollingElement!;
    w.__frames = [];
    w.__tracing = true;
    let prev: { tops: Map<string, number>; st: number; corr: number } | undefined;
    const sample = () => {
      const rs = w.__readingScroll;
      const corr = rs ? rs.corrections.reduce((a, b) => a + b, 0) : 0;
      const tops = new Map<string, number>();
      for (const el of document.querySelectorAll<HTMLElement>('[role="group"][data-ref]')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > -200 && r.top < innerHeight + 200) tops.set(el.dataset.ref!, r.top);
      }
      const ref = rs?.focus;
      if (prev && ref && tops.has(ref) && prev.tops.has(ref)) {
        const moved = tops.get(ref)! - prev.tops.get(ref)!;
        const own = scroller.scrollTop - prev.st - (corr - prev.corr);
        if (Math.abs(moved + own) > 1.5) w.__frames!.push(`${ref}: moved ${moved.toFixed(1)} vs own scroll ${own.toFixed(1)}`);
      }
      prev = { tops, st: scroller.scrollTop, corr };
    };
    const loop = () => requestAnimationFrame(() => { sample(); if (w.__tracing) loop(); });
    loop();
  });
  await scrollIntoBereshit2(page);
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames?: string[]; __tracing?: boolean };
    w.__tracing = false;
    return w.__frames ?? [];
  });
  expect(await readingVerse(page)).toMatch(/^Zohar, Bereshit 2:/);
  await expect(header("Zohar, Bereshit 2")).toHaveAttribute("lang", "en"); // the labels did change language on the way
  expect(frames).toEqual([]);
});

test("labels changing language leave the active verse where the reader is", async ({ page }) => {
  // The column follows the section being read to pick its labels; the verse it marks as active (the reading line's, or the one
  // chosen with the sidebar open) must stay that verse, and only that one, through the switch.
  await open(page, "/Zohar,_Bereshit.1?lang=en");
  await page.waitForTimeout(1000);
  // every frame: the verses marked active, against the verse at the reading line
  await page.evaluate(() => {
    const w = window as unknown as { __readingScroll?: { focus?: string }; __marks?: string[]; __tracing?: boolean };
    w.__marks = [];
    w.__tracing = true;
    const loop = () =>
      requestAnimationFrame(() => {
        const focus = w.__readingScroll?.focus;
        const marked = [...document.querySelectorAll<HTMLElement>('[role="group"][data-focused="true"]')].map((e) => e.dataset.ref);
        if (focus && (marked.length !== 1 || marked[0] !== focus)) w.__marks!.push(`reading ${focus}, marked [${marked.join(", ")}]`);
        if (w.__tracing) loop();
      });
    loop();
  });
  await scrollIntoBereshit2(page);
  const marks = await page.evaluate(() => {
    const w = window as unknown as { __marks?: string[]; __tracing?: boolean };
    w.__tracing = false;
    return [...new Set(w.__marks ?? [])];
  });
  await expect(page.locator('section[data-ref="Zohar, Bereshit 2"] h2')).toHaveAttribute("lang", "en");
  expect(marks).toEqual([]);
  const verse = await readingVerse(page);
  expect(verse).toMatch(/^Zohar, Bereshit 2:/);
  const marked = await page.locator('[role="group"][data-focused="true"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.ref));
  expect(marked).toEqual([verse]);
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
