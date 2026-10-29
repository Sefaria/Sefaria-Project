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

// @feature TXT-002 @feature BOK-018 @feature TXD-013
test.describe("verse ranges (verified on sefaria.org 2026-10-28)", () => {
  test("a Torah portion stays in the address, highlighted, and the header names its verses", async ({ page }) => {
    await open(page, "/Genesis.6.9-11.32?lang=bi");
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/Genesis.6.9-11.32");
    await expect(page.locator('[data-highlighted="true"]').first()).toBeVisible();
    await expect(page.locator("main header").first()).toContainText("Genesis 6:9-22");
  });

  test("an aliyah from the contents stays too", async ({ page }) => {
    await open(page, "/Genesis.7.1-16?lang=bi");
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/Genesis.7.1-16");
    await expect(page.locator('[data-highlighted="true"]')).toHaveCount(16);
  });

  // a range is kept because of where it starts, not its length (VERIFIED 2026-10-29 on sefaria.org at 1280px: /Genesis.6.9-11 and
  // /Genesis.1.1-3 stay, highlighted; /Genesis.1.3-5 collapses to /Genesis.1.3)
  test("a short range that starts at a portion's first verse stays, highlighted", async ({ page }) => {
    await open(page, "/Genesis.6.9-11?lang=bi");
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/Genesis.6.9-11");
    await expect(page.locator('[data-highlighted="true"]')).toHaveCount(3);
  });

  test("a short range that is not a portion collapses to its first verse", async ({ page }) => {
    await open(page, "/Genesis.1.3-5?lang=bi");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/Genesis.1.3");
    await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0);
  });

  // @feature TXT-004 @feature RTE-046
  test("Onkelos keeps aliyot=1 from its address", async ({ page }) => {
    await open(page, "/Onkelos_Genesis.2?lang=bi&aliyot=1");
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).searchParams.get("aliyot")).toBe("1");
    await expect(page.getByRole("heading", { name: "Bereshit: Second" })).toBeVisible();
  });
});

// CODE_REVIEW R-09: every navigation (and each scroll pause is one: the address catches up) ran a server function to read the
// cookies — an HTTP round trip per pause. The browser reads its cookies itself.
test("reading on makes no round trips to the server for preferences", async ({ page }) => {
  await open(page, "/Genesis.1.1?lang=en");
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/_serverFn/")) calls.push(r.url());
  });
  for (let i = 0; i < 3; i++) {
    await wheel(page, 300, 2);
    await page.waitForTimeout(500);
  }
  await expect.poll(() => new URL(page.url()).pathname).not.toBe("/Genesis.1.1");
  expect(calls).toEqual([]);
});

// CODE_REVIEW R-12: adding a section (and its links arriving) re-rendered every verse already in the column
test("a section added while reading leaves the verses already there alone (no re-render)", async ({ page }) => {
  await open(page, "/Genesis.10?lang=bi");
  await page.waitForTimeout(2500); // links and neighbours settle
  const renders = () => page.evaluate(() => ({ ...(window as unknown as { __segmentRenders: Record<string, number> }).__segmentRenders }));
  const before = await renders();
  const existing = Object.keys(before).filter((r) => /^Genesis 10:/.test(r));
  expect(existing.length).toBeGreaterThan(20);
  await setScrollTop(page, "bottom");
  await expect.poll(() => sectionRefs(page)).toContain("Genesis 11");
  await page.waitForTimeout(2500); // Genesis 11's links arrive too
  const after = await renders();
  const rerendered = existing.filter((r) => after[r] !== before[r]);
  expect(rerendered).toEqual([]);
});

// CODE_REVIEW R-25: the column kept every section it ever loaded; far ones now go, without moving the text the reader is on
test("a long read keeps the column bounded, the reader's verse still, and scrolling back reloads what went", async ({ page }) => {
  await open(page, "/Psalms.1?lang=en");
  for (let i = 0; i < 30; i++) {
    await wheel(page, 900, 2);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(1500);
  const held = await sectionRefs(page);
  expect(held.length).toBeLessThan(16); // ~20+ psalms were passed
  expect(held).not.toContain("Psalms 3");
  const ref = await focused(page);
  const top = await segmentTop(page, ref!);
  await page.waitForTimeout(1500); // any trim after the last load has happened by now
  expect(Math.abs((await segmentTop(page, ref!)) - top)).toBeLessThan(2);
  const firstHeld = held[0]!;
  for (let i = 0; i < 6; i++) {
    await wheel(page, -900, 2);
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => (await sectionRefs(page))[0]).not.toBe(firstHeld); // an earlier psalm came back
});

test("windowing in a bilingual column with the sidebar open keeps the reader's verse still", async ({ page }) => {
  await open(page, "/Psalms.1.1?lang=bi&with=all");
  for (let i = 0; i < 25; i++) {
    await wheel(page, 900, 2);
    await page.waitForTimeout(120);
  }
  // trimmed once scrolling is idle: on a slower machine (CI) that takes longer than a fixed wait
  await expect.poll(async () => (await sectionRefs(page)).length, { timeout: 15_000 }).toBeLessThan(16);
  const ref = await focused(page);
  const top = await segmentTop(page, ref!);
  await page.waitForTimeout(1500);
  expect(Math.abs((await segmentTop(page, ref!)) - top)).toBeLessThan(2);
  // the text keeps exactly one tab stop, on the verse being read, after sections were trimmed (R-31)
  await expect(page.locator('[role="group"][data-selectable="true"][tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('[role="group"][data-selectable="true"][tabindex="0"]')).toHaveAttribute("data-ref", ref!);
});

// CODE_REVIEW low: a commentary range across chapters showed refs like "Rashi on Genesis 1:31:1:1" and lost its range (so the reader
// arrived nowhere in particular); like any range that is not a portion, it arrives at its first comment and the address collapses to it
test("a commentary range across chapters shows both chapters' comments and arrives at its first", async ({ page }) => {
  await open(page, "/Rashi_on_Genesis.1.31.1-2.2.1?lang=bi");
  const first = page.locator('[role="group"][data-ref="Rashi on Genesis 1:31:1"]');
  await expect(first).toHaveAttribute("data-scroll-target", "true");
  await expect(first).toBeInViewport();
  await expect(page.locator('[role="group"][data-ref="Rashi on Genesis 2:2:1"]')).toHaveCount(1);
  await expect(page.locator('[data-ref="Rashi on Genesis 1:31:1:1"]')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/Rashi_on_Genesis.1.31.1");
});

// review F03: the sections the page opened with were always kept, and the trim behind the reader stopped at the first of them, so a
// long read forward kept every section it had loaded
test("reading far forward lets the opening section go, and the column stays bounded", async ({ page }) => {
  await open(page, "/Genesis.1?lang=en");
  for (let i = 0; i < 40; i++) {
    await wheel(page, 1200, 2);
    await page.waitForTimeout(100);
  }
  await expect.poll(async () => (await sectionRefs(page)).includes("Genesis 1"), { timeout: 20_000 }).toBe(false);
  const held = await sectionRefs(page);
  expect(held.length).toBeLessThan(12);
  // what is left is contiguous: each section's neighbour is the next one
  const nums = held.map((r) => Number(r!.split(" ")[1]));
  expect(nums).toEqual(nums.map((_, i) => nums[0]! + i));
  // and the address followed the reader
  await expect.poll(() => new URL(page.url()).pathname).not.toMatch(/^\/Genesis\.1(\.|$)/);
});

// A trim above while little is loaded below (texts arriving slowly, as in CI) made the browser pull the scroll position back to
// the new end; the engine took that for the reader's own scrolling and left the verse 2,000+ px away. Every frame after the reader
// stops: the verse being read stays put while sections arrive below and go above.
test("windowing on a slow connection never moves the verse being read", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/v3/texts/**", async (r) => {
    await new Promise((x) => setTimeout(x, 800));
    await r.continue();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/Psalms.1.1?lang=bi&with=all");
  for (let i = 0; i < 25; i++) {
    await wheel(page, 900, 2);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500); // the reader has stopped; from here on nothing they see may move
  const moves = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const out: string[] = [];
        const ref = document.querySelector('[data-focused="true"]')!.getAttribute("data-ref")!;
        const top = () => document.querySelector(`[role="group"][data-ref="${ref}"]`)?.getBoundingClientRect().top;
        const start = top()!;
        const sections = () => document.querySelectorAll("section[data-ref]").length;
        let seen = sections();
        let trims = 0;
        // watch until a trim has happened and things have been quiet for 3 s after it (a slow machine trims later), at most 20 s
        const began = performance.now();
        let quietFrom = began;
        const tick = () => {
          const t = top();
          const n = sections();
          if (n < seen) trims++;
          if (n !== seen) quietFrom = performance.now();
          seen = n;
          if (t === undefined || Math.abs(t - start) > 1.5) out.push(`${ref} moved ${t === undefined ? "away" : Math.round(t - start)}px`);
          const now = performance.now();
          const done = now - began > 20_000 || (trims > 0 && now - quietFrom > 3000);
          if (!done && out.length < 5) requestAnimationFrame(tick);
          else resolve(trims ? out : ["no trim happened: the test did not exercise windowing"]);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(moves).toEqual([]);
});
