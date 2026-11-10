import { expect, test, type Page } from "@playwright/test";
import { open, wheel } from "./helpers";

/**
 * Ranges and multi-segment selection with legacy parity (owner decision 2026-11-10). Every case was VERIFIED on www.sefaria.org on
 * 2026-11-10 with the same steps (lane-D report: legacy-ranges probe); the expected address and highlighted segments are what it did.
 * lib/text/range-selection.ts has the rules. Owner decision 2026-11-10: every range of several segments is kept and highlighted.
 */
const highlighted = (page: Page) =>
  page.locator('[data-reader-scroller] [data-highlighted="true"][data-ref]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-ref")))]);
const path = (page: Page) => decodeURIComponent(new URL(page.url()).pathname);
const sidebar = (page: Page) => page.getByRole("complementary");
const seg = (page: Page, ref: string) => page.locator(`[role="group"][data-ref="${ref}"]`);

/** Select text from the start of one segment's words to inside another's, as a reader drags. */
async function dragSelect(page: Page, from: string, to: string) {
  // the first segment just under the reader's header, so the last one is on screen too
  await seg(page, from).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await seg(page, from).evaluate((el) => (el.closest("[data-reader-scroller]") as HTMLElement).scrollBy(0, -120));
  await page.waitForTimeout(500);
  // a point on the first and on the fifth word of each segment's text (not its number, which cannot be selected)
  const wordAt = (ref: string, n: number) =>
    seg(page, ref).evaluate((el, n) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.textContent!.trim().length > 20 && t.parentElement!.getClientRects().length && getComputedStyle(t.parentElement!).userSelect !== "none" && !t.parentElement!.closest("[aria-hidden='true']") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
      const t = walker.nextNode() as Text;
      const r = document.createRange();
      const i = Math.min(n ? t.textContent!.split(" ").slice(0, n).join(" ").length + 1 : 0, t.textContent!.length - 1);
      r.setStart(t, i);
      r.setEnd(t, i + 1);
      const b = r.getBoundingClientRect();
      return { x: b.left + 1, y: b.top + b.height / 2 };
    }, n);
  const a = await wordAt(from, 0);
  const z = await wordAt(to, 4);
  if (z.y > page.viewportSize()!.height) throw new Error(`${to} is off screen (${z.y}); the drag could not reach it`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 12 });
  await page.mouse.up();
}

const G130_23 = ["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2", "Genesis 2:3"];

test.describe("a pasted range across sections stays and is highlighted", () => {
  for (const withSidebar of [false, true]) {
    const q = withSidebar ? "?lang=en&with=all" : "?lang=en";
    test(`Genesis 1:30-2:3, sidebar ${withSidebar ? "open" : "closed"}`, async ({ page }) => {
      await open(page, `/Genesis.1.30-2.3${q}`);
      await expect.poll(() => highlighted(page)).toEqual(G130_23);
      await page.waitForTimeout(800); // past the moment a range inside one section collapses
      expect(path(page)).toBe("/Genesis.1.30-2.3");
      expect(await highlighted(page)).toEqual(G130_23);
      await expect(sidebar(page)).toHaveCount(withSidebar ? 1 : 0);
    });

    test(`Berakhot 2b:5-3a:2 (across dapim), sidebar ${withSidebar ? "open" : "closed"}`, async ({ page }) => {
      await open(page, `/Berakhot.2b.5-3a.2${q}`);
      await expect.poll(async () => (await highlighted(page)).length).toBe(17);
      const hl = await highlighted(page);
      expect([hl[0], hl.at(-1)]).toEqual(["Berakhot 2b:5", "Berakhot 3a:2"]);
      await page.waitForTimeout(800);
      expect(path(page)).toBe("/Berakhot.2b.5-3a.2");
    });

    test(`a commentary range across chapters, sidebar ${withSidebar ? "open" : "closed"}`, async ({ page }) => {
      await open(page, `/Rashi_on_Genesis.1.31.1-2.2.1${q}`);
      await expect.poll(() => highlighted(page)).toEqual(["Rashi on Genesis 1:31:1", "Rashi on Genesis 2:2:1"]);
      await page.waitForTimeout(800);
      expect(path(page)).toBe("/Rashi_on_Genesis.1.31.1-2.2.1");
    });
  }

  test("a range of whole chapters is all highlighted and written by its verses (sidebar closed)", async ({ page }) => {
    await open(page, "/Genesis.6-8?lang=en");
    await expect(page).toHaveURL(/\/Genesis\.6\.1-8\.22\?/);
    await expect.poll(async () => (await highlighted(page)).length).toBe(68);
  });

  test("a range of whole chapters keeps its address with the sidebar open, all highlighted", async ({ page }) => {
    await open(page, "/Genesis.6-8?lang=en&with=all");
    await expect.poll(async () => (await highlighted(page)).length).toBe(68);
    await page.waitForTimeout(800);
    expect(path(page)).toBe("/Genesis.6-8");
  });

  test("reading on drops the highlight and the address follows the verse", async ({ page }) => {
    await open(page, "/Berakhot.2b.5-3a.2?lang=en");
    await expect.poll(async () => (await highlighted(page)).length).toBe(17);
    await wheel(page, 400, 6);
    await expect.poll(() => path(page)).toMatch(/^\/Berakhot\.\d+[ab]\.\d+$/);
    await expect.poll(() => highlighted(page)).toEqual([]);
  });
});

// Owner decision 2026-11-10: a range inside one section stays and is highlighted too. Probed on sefaria.org (sidebar closed):
// /Genesis.1.1-3, /Genesis.1.4-6, /Genesis.1.20-25, /Exodus.3.1-4, /Psalms.23.1-4, /Berakhot.5a.3-6 stay highlighted;
// /Genesis.1.20-25?with=all stays with 6 highlighted; /Genesis.1.3-5 showed 3 blue at 3.5 s and collapsed by 8 s (a race, not ported).
test.describe("a pasted range inside one section stays and is highlighted", () => {
  for (const [path_, refs] of [
    ["/Genesis.1.3-5", ["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"]],
    ["/Genesis.1.20-25", ["Genesis 1:20", "Genesis 1:21", "Genesis 1:22", "Genesis 1:23", "Genesis 1:24", "Genesis 1:25"]],
    ["/Berakhot.5a.3-6", ["Berakhot 5a:3", "Berakhot 5a:4", "Berakhot 5a:5", "Berakhot 5a:6"]],
  ] as const) {
    for (const withSidebar of [false, true]) {
      test(`${path_}, sidebar ${withSidebar ? "open" : "closed"}`, async ({ page }) => {
        await open(page, `${path_}?lang=en${withSidebar ? "&with=all" : ""}`);
        await expect.poll(() => highlighted(page)).toEqual([...refs]);
        await expect(sidebar(page)).toHaveCount(withSidebar ? 1 : 0);
        // the column has settled (the moment the old code collapsed a range) and nothing changed
        await page.waitForTimeout(1000);
        expect(path(page)).toBe(path_);
        expect(await highlighted(page)).toEqual([...refs]);
        if (withSidebar) await expect(page.locator('[data-focused="true"]')).toHaveAttribute("data-ref", refs[0]);
      });
    }
  }
});

test.describe("a daf without its amud is both amudim, all highlighted (sefaria.org, 2026-11-10)", () => {
  test("/Berakhot.2, sidebar closed: written as /Berakhot.2a.1-2b.19, in place", async ({ page }) => {
    await open(page, "/Exodus.1?lang=en");
    const length = await page.evaluate(() => history.length);
    await open(page, "/Berakhot.2?lang=en");
    await expect(page).toHaveURL(/\/Berakhot\.2a\.1-2b\.19\?/);
    await expect.poll(async () => (await highlighted(page)).length).toBe(33);
    const hl = await highlighted(page);
    expect([hl[0], hl.at(-1)]).toEqual(["Berakhot 2a:1", "Berakhot 2b:19"]);
    expect(await page.evaluate(() => history.length)).toBe(length + 1); // the rewrite replaced its entry
  });
  test("/Berakhot.2, sidebar open: written as /Berakhot.2a-2b", async ({ page }) => {
    await open(page, "/Berakhot.2?lang=en&with=all");
    await expect(page).toHaveURL(/\/Berakhot\.2a-2b\?.*with=all/);
    await expect.poll(async () => (await highlighted(page)).length).toBe(33);
  });
});

test("a range of whole sections longer than what loads with the page keeps its address, with no blue over it", async ({ page }) => {
  await open(page, "/Genesis.1-50?lang=en");
  await expect(seg(page, "Genesis 1:1")).toBeVisible();
  await page.waitForTimeout(1000);
  expect(path(page)).toBe("/Genesis.1-50");
  expect(await highlighted(page)).toEqual([]);
});

test.describe("selecting text across segments highlights them, as on sefaria.org", () => {
  test.use({ viewport: { width: 1280, height: 1300 } }); // the whole selection on screen, as a reader's drag needs
  test("across a chapter boundary, sidebar closed: highlighted, the address and history unchanged, no sidebar", async ({ page }) => {
    await open(page, "/Genesis.1.29?lang=en");
    await expect(seg(page, "Genesis 2:2")).toBeAttached();
    const before = path(page);
    const length = await page.evaluate(() => history.length);
    await dragSelect(page, "Genesis 1:30", "Genesis 2:2");
    await expect.poll(() => highlighted(page)).toEqual(["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2"]);
    expect(path(page)).toBe(before);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect(sidebar(page)).toHaveCount(0);
  });

  test("inside the section being read, sidebar closed: the address becomes the range, in place", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en");
    const length = await page.evaluate(() => history.length);
    await dragSelect(page, "Genesis 1:3", "Genesis 1:5");
    await expect(page).toHaveURL(/\/Genesis\.1\.3-5\?/);
    await expect.poll(() => highlighted(page)).toEqual(["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"]);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect(sidebar(page)).toHaveCount(0);
  });

  test("across a chapter boundary, sidebar open: the address becomes the range and the sidebar shows it", async ({ page }) => {
    await open(page, "/Genesis.1.29?lang=en&with=all");
    await expect(seg(page, "Genesis 2:2")).toBeAttached();
    await dragSelect(page, "Genesis 1:30", "Genesis 2:2");
    await expect.poll(() => highlighted(page)).toEqual(["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2"]);
    await expect(page).toHaveURL(/\/Genesis\.1\.30-2\.2\?.*with=all/);
    await expect(sidebar(page)).toHaveCount(1);
  });

  test("inside one section, sidebar open: the address becomes the range and the sidebar shows it", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en&with=all");
    const length = await page.evaluate(() => history.length);
    await dragSelect(page, "Genesis 1:3", "Genesis 1:5");
    await expect.poll(() => highlighted(page)).toEqual(["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"]);
    await expect(page).toHaveURL(/\/Genesis\.1\.3-5\?.*with=all/);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect(sidebar(page)).toHaveCount(1);
  });

  test("a navigation ends a selection at once (it does not wait for a scroll)", async ({ page }) => {
    await open(page, "/Genesis.1.29?lang=en");
    await expect(seg(page, "Genesis 2:2")).toBeAttached();
    await dragSelect(page, "Genesis 1:30", "Genesis 2:2"); // across chapters: the address stays, the selection is the only blue
    await expect.poll(async () => (await highlighted(page)).length).toBe(4);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.evaluate(() => document.dispatchEvent(new CustomEvent("sefaria:bootstrap-url", { detail: { url: "/Genesis.1.10?lang=en" } })));
    await expect(page).toHaveURL(/\/Genesis\.1\.10\?/);
    await expect.poll(() => highlighted(page), { timeout: 1500 }).toEqual([]);
  });

  test("choosing a verse after a selection drops it", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en");
    await dragSelect(page, "Genesis 1:3", "Genesis 1:5");
    await expect.poll(async () => (await highlighted(page)).length).toBe(3);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await seg(page, "Genesis 1:7").click();
    await expect(page).toHaveURL(/\/Genesis\.1\.7\?.*with=all/);
    await expect.poll(() => highlighted(page)).toEqual([]);
  });
});
