import { expect, test } from "@playwright/test";
import { focused, open, scrollTop, sectionRefs, segmentTop, setScrollTop, wheel } from "./helpers";

const sections = (page: import("@playwright/test").Page) => page.locator("[data-language] section[data-ref]");

// @feature TXD-052 Infinite scroll up and down @feature TXD-002 @feature TXD-056
test.describe("infinite scroll", () => {
  test("approaching the bottom appends the next section", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await setScrollTop(page, "bottom");
    await expect.poll(() => sectionRefs(page)).toContain("Genesis 2");
  });

  test("keeps going: several sections in a row, in order", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    for (const next of ["Genesis 2", "Genesis 3", "Genesis 4"]) {
      await setScrollTop(page, "bottom");
      await expect.poll(() => sectionRefs(page)).toContain(next);
    }
    expect((await sectionRefs(page)).slice(0, 4)).toEqual(["Genesis 1", "Genesis 2", "Genesis 3", "Genesis 4"]);
  });

  test("the previous section is added above while you read, without moving what you are reading", async ({ page }) => {
    await open(page, "/Genesis.2.5?lang=en");
    await expect.poll(() => sectionRefs(page)).toContain("Genesis 1"); // loaded on arrival (near the top edge)
    const before = await segmentTop(page, "Genesis 2:5");
    await page.waitForTimeout(300);
    expect(Math.abs((await segmentTop(page, "Genesis 2:5")) - before)).toBeLessThan(1);
  });

  test("a section already in the cache appends without a network request", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.waitForTimeout(1500); // Genesis 2 is prefetched while Genesis 1 is read
    const requests: string[] = [];
    page.on("request", (r) => /api\/v3\/texts\/Genesis(%20| |_)2/.test(r.url()) && requests.push(r.url()));
    await setScrollTop(page, "bottom");
    await expect.poll(() => sectionRefs(page)).toContain("Genesis 2");
    expect(requests).toEqual([]);
  });

  test("the start of a book shows its title", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await expect(page.getByTestId("text-column")).toContainText("Genesis");
  });

  test("the end of a book says so and stops loading", async ({ page }) => {
    await open(page, "/Obadiah.1?lang=en");
    await setScrollTop(page, "bottom");
    await expect(page.getByTestId("end-of-text")).toBeVisible();
    await expect(sections(page)).toHaveCount(1);
  });
});

// @feature TXD-055 Visible-ref tracking drives URL and header
test.describe("the reader's place is tracked to the verse", () => {
  test("the address bar names the verse being read, as the old reader did", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await wheel(page, 300, 2);
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/Genesis\.1\.\d+$/);
    const first = new URL(page.url()).pathname;
    await wheel(page, 300, 2);
    await expect.poll(() => new URL(page.url()).pathname).not.toBe(first);
    expect(new URL(page.url()).search).toBe("?lang=en&aliyot=0"); // as sefaria.org writes it (aliyot for the Torah)
  });

  test("the header and the title follow the section", async ({ page }) => {
    await open(page, "/Genesis.1.30?lang=en");
    for (let i = 0; i < 6; i++) {
      await wheel(page, 300);
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Genesis 2");
    await expect(page).toHaveTitle(/Genesis 2/);
  });

  test("URL updates never reload or reset the column", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await wheel(page, 300, 3);
    await expect.poll(() => new URL(page.url()).pathname).not.toBe("/Genesis.1");
    const mounts = await page.evaluate(() => (window as unknown as { __columnMounts: { n: number } }).__columnMounts.n);
    await wheel(page, 300, 6);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __columnMounts: { n: number } }).__columnMounts.n)).toBe(mounts);
  });

  // @feature RTE-054 Push vs replace history behavior
  test("scrolling replaces the history entry; choosing a verse adds one", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    const length = () => page.evaluate(() => history.length);
    const start = await length();
    await wheel(page, 300, 3);
    await expect.poll(() => new URL(page.url()).pathname).not.toBe("/Genesis.1");
    expect(await length()).toBe(start);
    const box = await page.locator('[role="group"][data-ref="Genesis 1:9"]').boundingBox();
    await page.mouse.click(box!.x + 80, box!.y + 10);
    await expect(page).toHaveURL(/with=all/);
    expect(await length()).toBe(start + 1);
    await page.goBack();
    await expect(page).not.toHaveURL(/with=/);
  });

  test("a verse link keeps its address until the reader moves", async ({ page }) => {
    await open(page, "/Genesis.1.25?lang=en");
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe("/Genesis.1.25");
  });
});

// @feature TXD-054 Initial and highlight scroll positioning @feature TXD-068
test.describe("linked verses", () => {
  test("a verse far down the chapter is placed at the reading line, and is the current verse", async ({ page }) => {
    await open(page, "/Genesis.1.28?lang=en");
    await expect(page.locator('[data-ref="Genesis 1:28"]')).toBeInViewport();
    const column = await page.locator("[data-reader-scroller]").boundingBox();
    expect((await segmentTop(page, "Genesis 1:28")) - column!.y).toBeCloseTo(142, -1);
    expect(await focused(page)).toBe("Genesis 1:28");
  });

  for (const [path, verse, viewport] of [
    ["/Genesis.2.3?lang=en", "Genesis 2:3", { width: 1280, height: 800 }],
    ["/Berakhot.5b.3?lang=bi", "Berakhot 5b:3", { width: 1280, height: 860 }],
    ["/Genesis.2.3?lang=en", "Genesis 2:3", { width: 390, height: 844 }],
  ] as const) {
    test(`a linked verse is in place from the first visible frame: ${path} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // Sampled after each paint, and only while the text is visible (it may be held back while fonts arrive).
      await page.addInitScript((v) => {
        const w = window as unknown as { __tops: number[] };
        w.__tops = [];
        const tick = () => {
          const el = document.querySelector(`[role="group"][data-ref="${v}"]`);
          const col = document.querySelector<HTMLElement>("[data-reader-scroller]");
          if (el && col && col.style.visibility !== "hidden") w.__tops.push(Math.round(el.getBoundingClientRect().top));
          requestAnimationFrame(() => setTimeout(tick, 0));
        };
        requestAnimationFrame(() => setTimeout(tick, 0));
      }, verse);
      await open(page, path);
      await page.waitForTimeout(1500);
      const tops = await page.evaluate(() => (window as unknown as { __tops: number[] }).__tops);
      expect(tops.length).toBeGreaterThan(10);
      expect(new Set(tops).size, JSON.stringify([...new Set(tops)])).toBe(1); // never moved, even as neighbours were added
    });
  }

  test("with the sidebar closed, a linked verse is not highlighted (old reader's behaviour)", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en");
    const bg = await page.locator('[data-ref="Genesis 1:3"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgba(0, 0, 0, 0)");
  });
});

// @feature TXD-009 @feature RTE-026
test.describe("crawler-visible navigation", () => {
  test("the text itself is in the server-rendered page, not added later", async ({ request }) => {
    const html = await (await request.get("/Genesis.1.3?lang=en")).text();
    expect(html).toContain('data-ref="Genesis 1:3"');
    expect(html).toMatch(/Let there be light/);
  });

  test("the page links to its neighbouring sections", async ({ request }) => {
    const html = await (await request.get("/Genesis.2")).text();
    expect(html).toMatch(/rel="prev"[^>]*href="\/Genesis\.1"|href="\/Genesis\.1"[^>]*rel="prev"/);
    expect(html).toMatch(/rel="next"[^>]*href="\/Genesis\.3"|href="\/Genesis\.3"[^>]*rel="next"/);
  });
});

void scrollTop;
