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

// sefaria.org (VERIFIED 2026-11-10, Playwright, read-only; lane-R report): /Genesis.1-50 is written /Genesis.1.1-50.26 before any text
// shows, and every verse is blue as its chapter arrives (it then sometimes loses the race described above and collapses to a verse).
test.describe("a range of whole sections longer than what loads with the page", () => {
  test("is all highlighted and written by its verses once its last chapter is known, in place, without moving the text", async ({ page }) => {
    await open(page, "/Exodus.1?lang=en");
    const length = await page.evaluate(() => history.length);
    // every frame from the start: where Genesis 1:1 is on screen, and the address
    await page.addInitScript(() => {
      const w = window as unknown as { __tops: [string, number][] };
      w.__tops = [];
      const tick = () => {
        const el = document.querySelector('[data-reader-scroller] [role="group"][data-ref="Genesis 1:1"]');
        if (el) w.__tops.push([location.pathname, Math.round(el.getBoundingClientRect().top)]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await open(page, "/Genesis.1-50?lang=en");
    await expect(page).toHaveURL(/\/Genesis\.1\.1-50\.26\?/);
    await page.waitForTimeout(500);
    const tops = await page.evaluate(() => (window as unknown as { __tops: [string, number][] }).__tops);
    // the text was on screen before the address changed, and it did not move when it changed
    expect(tops.some(([p]) => p === "/Genesis.1-50")).toBe(true);
    expect(new Set(tops.map(([, t]) => t)).size).toBe(1);
    expect(await page.evaluate(() => history.length)).toBe(length + 1); // the rewrite replaced its entry
    // every loaded verse is blue, from the first chapter's first
    const hl = await highlighted(page);
    const all = await page.locator("[data-reader-scroller] [role='group'][data-ref]").evaluateAll((els) => els.map((e) => e.getAttribute("data-ref")));
    expect(hl[0]).toBe("Genesis 1:1");
    expect(hl).toEqual([...new Set(all)]);
    await page.waitForTimeout(800);
    expect(path(page)).toBe("/Genesis.1.1-50.26");
  });

  test("with the sidebar open keeps its address, all highlighted", async ({ page }) => {
    await open(page, "/Genesis.1-50?lang=en&with=all");
    await expect.poll(async () => (await highlighted(page))[0]).toBe("Genesis 1:1");
    await page.waitForTimeout(800);
    expect(path(page)).toBe("/Genesis.1-50");
  });

  test("a later chapter is blue when the column loads it", async ({ page }) => {
    await open(page, "/Psalms.1-150?lang=en");
    await expect(page).toHaveURL(/\/Psalms\.1\.1-150\.6\?/);
    // the column fills below (not the reader scrolling, which would end the range: the address follows the verse read)
    await expect
      .poll(async () => {
        await page.locator("[data-reader-scroller]").evaluate((el) => (el.scrollTop = el.scrollHeight));
        return (await highlighted(page)).some((r) => /^Psalms ([5-9]|\d\d+):/.test(r!));
      })
      .toBe(true);
    expect(path(page)).toBe("/Psalms.1.1-150.6");
  });
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

/** Select segments' text by script (the first words of `from`, or from it into `to`): what a keyboard or a touch leaves, no mouse event. */
async function selectByScript(page: Page, from: string, to?: string) {
  await page.evaluate(
    ([from, to]) => {
      const textOf = (ref: string) => {
        const el = document.querySelector(`[data-reader-scroller] [role="group"][data-ref="${ref}"]`)!;
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
          acceptNode: (t) => (t.textContent!.trim().length > 20 && t.parentElement!.getClientRects().length && getComputedStyle(t.parentElement!).userSelect !== "none" && !t.parentElement!.closest("[aria-hidden='true']") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
        });
        return w.nextNode() as Text;
      };
      const a = textOf(from!);
      const z = textOf(to ?? from!);
      getSelection()!.setBaseAndExtent(a, 0, z, Math.min(10, z.length));
    },
    [from, to],
  );
}

// Lane R (wave 2). sefaria.org (VERIFIED 2026-11-10, Playwright, read-only): after a drag over 1:3-1:5 (or 1:30-2:2), Cmd+C, Shift and a
// reflow (the window narrowed) leave the range and its blue as they were. Here a key that does not scroll is no longer taken for
// reading on (use-reading-scroll.ts), so a later reflow cannot settle on a verse and drop the range.
test.describe("keys that do not scroll leave a selected range alone", () => {
  test.use({ viewport: { width: 1280, height: 1300 } });
  for (const [start, from, to, address, refs] of [
    ["/Genesis.1.3", "Genesis 1:3", "Genesis 1:5", "/Genesis.1.3-5", ["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"]],
    ["/Genesis.1.29", "Genesis 1:30", "Genesis 2:2", "/Genesis.1.29", ["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2"]],
  ] as const) {
    test(`copy (Cmd+C), Shift, then a reflow: ${from}-${to} stays`, async ({ page }) => {
      await open(page, `${start}?lang=en`);
      await expect(seg(page, to)).toBeAttached();
      await dragSelect(page, from, to);
      await expect.poll(() => highlighted(page)).toEqual([...refs]);
      await expect.poll(() => path(page)).toBe(address);
      // a drag that reaches the column's edge scrolls it (the browser's, not the reader's wheel): the verse on the reading line changes
      await page.locator("[data-reader-scroller]").evaluate((el) => el.scrollBy(0, 250));
      await page.waitForTimeout(500);
      await page.keyboard.press("ControlOrMeta+c");
      await page.keyboard.press("Shift");
      await page.keyboard.press("Meta");
      await page.setViewportSize({ width: 760, height: 1300 }); // the window narrowed to the phone layout: everything reflows
      await page.waitForTimeout(1500); // well past the moment a scroll settles
      expect(await highlighted(page)).toEqual([...refs]);
      expect(path(page)).toBe(address);
    });
  }
});

// Lane R (wave 2): a selection made without a mouse makes a range too. sefaria.org listens to mouseup only (static/js/TextColumn.jsx),
// so there Shift+arrows or a long press make no range (VERIFIED 2026-11-10: Shift+Down in 1:3, no blue); a deliberate
// difference, asked for by the owner's wave-2 list (D4).
test.describe("a selection made by keyboard or touch makes a range, as a mouse selection does", () => {
  test.use({ viewport: { width: 1280, height: 1300 } });
  test("Shift+Down from a word selected in 1:3: the segments it reaches are highlighted and the address follows, in place", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en");
    await expect(seg(page, "Genesis 1:5")).toBeAttached();
    const length = await page.evaluate(() => history.length);
    await selectByScript(page, "Genesis 1:3"); // a word
    // down until the selection reaches into 1:4
    await expect
      .poll(async () => {
        await page.keyboard.press("Shift+ArrowDown");
        return page.evaluate(() => {
          const s = getSelection()!;
          return !!s.rangeCount && !!document.querySelector('[data-reader-scroller] [role="group"][data-ref="Genesis 1:4"]') && s.getRangeAt(0).intersectsNode(document.querySelector('[data-reader-scroller] [role="group"][data-ref="Genesis 1:4"]')!);
        });
      })
      .toBe(true);
    const refs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-reader-scroller] [role="group"][data-ref]')].filter((el) => getSelection()!.getRangeAt(0).intersectsNode(el)).map((el) => el.dataset.ref),
    );
    expect(refs.length).toBeGreaterThan(1);
    await expect.poll(() => highlighted(page)).toEqual(refs);
    await expect(page).toHaveURL(new RegExp(`/Genesis\\.1\\.3-${refs.at(-1)!.split(":")[1]}\\?`));
    expect(await page.evaluate(() => history.length)).toBe(length);
    await expect(sidebar(page)).toHaveCount(0);
  });

  test("a selection outside the text (the header) makes no range", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en");
    await expect(seg(page, "Genesis 1:5")).toBeAttached();
    await page.evaluate(() => getSelection()!.selectAllChildren(document.querySelector("header") ?? document.body.firstElementChild!));
    await page.waitForTimeout(800);
    expect(await highlighted(page)).toEqual([]);
    expect(path(page)).toBe("/Genesis.1.3");
  });
});

test.describe("on a phone, a selection made by touch (no mouseup) makes a range", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("1:3 to 1:4 selected (as a long press and its handles leave it): highlighted, the address follows", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en");
    await expect(seg(page, "Genesis 1:4")).toBeAttached();
    // Playwright cannot long-press to select; the selection it leaves is made here, with no mouse event at all
    await selectByScript(page, "Genesis 1:3", "Genesis 1:4");
    await expect.poll(() => highlighted(page)).toEqual(["Genesis 1:3", "Genesis 1:4"]);
    await expect(page).toHaveURL(/\/Genesis\.1\.3-4\?/);
  });
});
