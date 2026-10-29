import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const panels = (page: Page) => page.locator("section[data-panel-id]");
const width = (page: Page, id: string) => page.locator(`section[data-panel-id="${id}"]`).evaluate((e) => e.getBoundingClientRect().width);
const scroller = (page: Page, id: string) => page.locator(`section[data-panel-id="${id}"] [data-reader-scroller]`);

// @feature SHL-039 @feature SHL-066 @feature SHL-030 @feature RTE-049 @feature RTE-058
test.describe("several texts side by side (old multi-panel URLs)", () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test("p2 opens a second panel beside the first", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en&p2=Exodus.1&lang2=en");
    await expect(panels(page)).toHaveCount(2);
    await expect(page.getByRole("group", { name: "Open texts" })).toBeVisible();
    await expect(page.locator('section[data-panel-id="p2"] [role="group"][data-ref="Exodus 1:1"]')).toBeVisible();
    expect(Math.abs((await width(page, "p1")) - (await width(page, "p2")))).toBeLessThan(2); // even split
    await expect(page).toHaveTitle(/Genesis 1 and Exodus 1/);
  });

  test("a text with its sidebar beside another text: 37/26/37, as sefaria.org lays it out (592/416/592 at 1600px)", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all&p2=Exodus.1&lang2=en");
    // Panel 1 holds its own sidebar: 37 + 26 = 63% of the row.
    expect(Math.round(await width(page, "p1"))).toBeGreaterThan(1000);
    expect(Math.round(await width(page, "p1"))).toBeLessThan(1012);
    expect(Math.round(await width(page, "p2"))).toBeGreaterThan(588);
    expect(Math.round(await width(page, "p2"))).toBeLessThan(600);
    const aside = await page.locator('section[data-panel-id="p1"]').getByRole("complementary").boundingBox();
    expect(Math.round(aside!.width)).toBeGreaterThan(405);
    expect(Math.round(aside!.width)).toBeLessThan(420);
  });

  test("the old client's numbering (?with=all&p3=…: the sidebar takes number 2) opens every panel and is kept", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all&p3=Exodus.1&lang3=en");
    await expect(panels(page)).toHaveCount(2);
    await page.locator('section[data-panel-id="p2"] [data-reader-scroller]').hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => new URL(page.url()).search).toMatch(/^\?lang=en&with=all&lang2=bi&p3=Exodus\.1\.\d+&lang3=en&aliyot3=0$/);
  });

  test("each panel tracks its own place; scrolling one never moves the other", async ({ page }) => {
    await open(page, "/Genesis.1.5?lang=en&p2=Exodus.1.5&lang2=en");
    const p1Before = await page.locator('section[data-panel-id="p1"] [role="group"][data-ref="Genesis 1:5"]').evaluate((e) => e.getBoundingClientRect().top);
    const mounts = await page.evaluate(() => (window as unknown as { __columnMounts: { n: number } }).__columnMounts.n);
    await scroller(page, "p2").hover();
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(150);
    }
    await expect.poll(() => new URL(page.url()).searchParams.get("p2")).not.toBe("Exodus.1.5");
    expect(new URL(page.url()).pathname).toBe("/Genesis.1.5");
    const p1After = await page.locator('section[data-panel-id="p1"] [role="group"][data-ref="Genesis 1:5"]').evaluate((e) => e.getBoundingClientRect().top);
    expect(Math.abs(p1After - p1Before)).toBeLessThan(1);
    expect(await page.evaluate(() => (window as unknown as { __columnMounts: { n: number } }).__columnMounts.n)).toBe(mounts);
  });

  test("a verse selected in the second panel opens that panel's own sidebar (w2)", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en&p2=Exodus.1&lang2=en");
    await page.locator('section[data-panel-id="p2"] [role="group"][data-ref="Exodus 1:1"]').click({ position: { x: 60, y: 10 } });
    // VERIFIED on sefaria.org: …&p2=Exodus.1.1&lang2=bi&aliyot2=0&w2=all&lang3=en (the sidebar's language is lang3)
    await expect(page).toHaveURL(/p2=Exodus\.1\.1&lang2=en&aliyot2=0&w2=all&lang3=en$/);
    await expect(page.locator('section[data-panel-id="p2"]').getByRole("complementary")).toBeVisible();
    await expect(page.locator('section[data-panel-id="p1"]').getByRole("complementary")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/Genesis.1");
  });

  // @feature SHL-049 @feature I18-003
  test("a citation in the text opens the cited text beside it, the reader's panel untouched", async ({ page }) => {
    await open(page, "/Jerusalem_Talmud_Berakhot.1.1?lang=en");
    const link = page.locator('section[data-panel-id="p1"] a[data-sefaria-ref="Deuteronomy 8:10"]', { hasText: "Deut." }).first();
    await link.click();
    await expect(panels(page)).toHaveCount(2);
    await expect(page).toHaveURL(/\/Jerusalem_Talmud_Berakhot\.1\.1(\.\d+)?\?lang=en&p2=Deuteronomy\.8\.10/);
    await expect(page.locator('section[data-panel-id="p2"] [role="group"][data-ref="Deuteronomy 8:10"]')).toBeInViewport();
    await expect(page.locator('section[data-panel-id="p1"] [role="group"][data-ref="Jerusalem Talmud Berakhot 1:1:1"]')).toBeVisible();
    // I18-003: the new panel takes keyboard focus on its first control
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-panel-id]")?.getAttribute("data-panel-id"))).toBe("p2");
  });

  // @feature SHL-040
  test("when the row overflows, a panel that opens beside the first is scrolled into view", async ({ page }) => {
    await open(page, "/Jerusalem_Talmud_Berakhot.1.1?lang=en&p2=Genesis.1&p3=Exodus.1&p4=Leviticus.1&p5=Numbers.1");
    await page.locator('section[data-panel-id="p1"] a[data-sefaria-ref="Deuteronomy 8:10"]', { hasText: "Deut." }).first().click();
    // as sefaria.org: the citation takes the place of the panel next to it (Genesis 1)
    await expect(panels(page)).toHaveCount(5);
    await expect(page).toHaveURL(/p2=Deuteronomy\.8\.10&lang2=bi&aliyot2=0&p3=Exodus\.1/);
    await expect(page.locator('section [role="group"][data-ref="Deuteronomy 8:10"]')).toBeInViewport({ ratio: 0.3 });
  });

  // @feature SHL-048 @feature SHL-033
  // Owner decision 2026-10-06: exactly as sefaria.org (VERIFIED with scripts/parity-panels.mjs: citation, citation-replaces-reader-panel)
  // @feature SHL-049 @feature SHL-066
  test("a citation closes whatever is next to its panel — even a text the reader opened — and opens there", async ({ page }) => {
    await open(page, "/Ramban_on_Genesis.1.1?lang=bi&p2=Exodus.1");
    await page.locator('section[data-panel-id="p1"] a.ref-link[data-sefaria-ref="Exodus 12:2"]').first().click();
    await expect(page).toHaveURL(/\/Ramban_on_Genesis\.1\.1\.1\?lang=bi&p2=Exodus\.12\.2&lang2=bi&aliyot2=0$/);
    await expect(panels(page)).toHaveCount(2);
    // a second citation replaces the first
    await page.locator('section[data-panel-id="p1"] a.ref-link[data-sefaria-ref="Exodus 20:10"]').first().click();
    await expect(page).toHaveURL(/p2=Exodus\.20\.10&lang2=bi&aliyot2=0$/);
    await expect(panels(page)).toHaveCount(2);
    await expect(page.locator('section[data-panel-id="p2"] [role="group"][data-ref="Exodus 20:10"]')).toBeInViewport();
  });

  test("with the panel's sidebar open, a citation replaces the sidebar and keeps the panel after it", async ({ page }) => {
    await open(page, "/Ramban_on_Genesis.1.1.1?lang=bi&with=all&p3=Exodus.1");
    await expect(panels(page)).toHaveCount(2);
    await page.locator('section[data-panel-id="p1"] a.ref-link[data-sefaria-ref="Exodus 12:2"]').first().click();
    await expect(panels(page)).toHaveCount(3);
    await expect(page).toHaveURL(/\?lang=bi&p2=Exodus\.12\.2&lang2=bi&aliyot2=0&p3=Exodus\.1&lang3=bi&aliyot3=0$/);
    await expect(page.locator('section[data-panel-id="p1"]').getByRole("complementary")).toHaveCount(0);
  });

  // CON-033 (corrected), VERIFIED on sefaria.org: Open replaces the sidebar with a new panel, the text as itself
  // @feature CON-033
  test("Open on a connected text replaces the sidebar with a new panel after the reader's (50/50)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/Genesis.1.1?lang=bi&with=Rashi");
    const item = page.getByRole("complementary").locator("li[data-ref]").first();
    await expect(item).toHaveAttribute("data-ref", "Rashi on Genesis 1:1:1", { timeout: 30_000 });
    await item.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/Genesis\.1\.1\?lang=bi&aliyot=0&p2=Rashi_on_Genesis\.1\.1\.1&lang2=bi$/);
    await expect(panels(page)).toHaveCount(2);
    await expect(page.getByRole("complementary")).toHaveCount(0);
    const widths = await panels(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThanOrEqual(2);
    await expect(page.locator('section[data-panel-id="p2"] [role="group"][data-ref="Rashi on Genesis 1:1:1"]')).toBeInViewport();
  });

  // CODE_REVIEW R-24: panels are keyed by a stable identity, not their position: closing the first must not hand its component
  // (scroll, selection) to the second, which keeps its own — no remount, no jump to its top
  test("closing the first panel leaves the second exactly as it was (same element, same place)", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en&p2=Exodus.1&lang2=en");
    const second = page.locator('section[data-panel-id="p2"] [data-reader-scroller]');
    await second.evaluate((el) => {
      el.scrollTop = 1200;
      (el as unknown as { __mark: number }).__mark = 42; // survives only if this very element is kept
    });
    await page.waitForTimeout(300);
    const top = await second.evaluate((el) => el.scrollTop);
    await page.locator('section[data-panel-id="p1"]').getByRole("button", { name: "Close this text" }).click();
    await expect(panels(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\/Exodus\.1(\.\d+)?\?lang=en&aliyot=0$/);
    const after = page.locator('section[data-panel-id="p1"] [data-reader-scroller]');
    expect(await after.evaluate((el) => (el as unknown as { __mark?: number }).__mark)).toBe(42);
    expect(Math.abs((await after.evaluate((el) => el.scrollTop)) - top)).toBeLessThan(80);
  });

  // as sefaria.org: with the sidebar open on a verse, the header names that verse (ReaderControls shows the current ref)
  test("the header names the selected verse while the sidebar is open", async ({ page }) => {
    await open(page, "/Genesis.6.16?lang=en&with=all&lang2=en");
    await expect(page.locator('section[data-panel-id="p1"] header h1').first()).toHaveText("Genesis 6:16");
  });

  // as sefaria.org: a long title or version name stays on one line, cut with an ellipsis (it wrapped and ran over the text below the bar)
  test("a long version name in a narrow panel is one line ending in an ellipsis", async ({ page }) => {
    await open(page, "/Exodus.17?lang=en&p2=Ibn_Ezra_on_Exodus.17.6.1&lang2=en");
    const lines = page.locator('section[data-panel-id="p2"] header').first().locator("h1, h1 + div > *");
    await expect(lines.first()).toBeVisible();
    for (const line of await lines.all()) {
      const s = await line.evaluate((el) => ({ h: el.getBoundingClientRect().height, ws: getComputedStyle(el).whiteSpace, to: getComputedStyle(el).textOverflow }));
      expect(s.ws).toBe("nowrap");
      expect(s.to).toBe("ellipsis");
      expect(s.h).toBeLessThan(26);
    }
  });

  // review F02: opening and closing the sidebar rebuilt the reading column (a bare leaf vs a row put it under different elements)
  test("opening and closing the sidebar keeps the reading column itself (same element, its sections)", async ({ page }) => {
    await open(page, "/Genesis.1.5?lang=en");
    const scroller = page.locator("[data-reader-scroller]").first();
    await scroller.evaluate((el) => void ((el as unknown as { __mark: number }).__mark = 7));
    const sections = await page.locator("[data-reader-scroller] section[data-ref]").count();
    const box = await page.locator('[role="group"][data-ref="Genesis 1:6"]').boundingBox();
    await page.mouse.click(box!.x + 100, box!.y + 10);
    await expect(page.getByRole("complementary")).toBeVisible();
    expect(await page.locator("[data-reader-scroller]").first().evaluate((el) => (el as unknown as { __mark?: number }).__mark)).toBe(7);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("complementary")).toHaveCount(0);
    expect(await page.locator("[data-reader-scroller]").first().evaluate((el) => (el as unknown as { __mark?: number }).__mark)).toBe(7);
    expect(await page.locator("[data-reader-scroller] section[data-ref]").count()).toBeGreaterThanOrEqual(sections);
  });

  // review F07: a change of sidebar view dropped the panels' stable keys, so a panel renumbered by an earlier close was rebuilt
  test("after the first panel closed, changing the second's sidebar view keeps the panel (same element)", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en&p2=Exodus.1.3&lang2=en&w2=all");
    await page.locator('section[data-panel-id="p1"]').getByRole("button", { name: "Close this text" }).click();
    await expect(panels(page)).toHaveCount(1);
    const scroller = page.locator('section[data-panel-id="p1"] [data-reader-scroller]');
    await scroller.evaluate((el) => void ((el as unknown as { __mark: number }).__mark = 9));
    await page.getByRole("complementary").getByRole("link", { name: /^Translations/ }).first().click();
    await expect(page).toHaveURL(/with=Translations/);
    expect(await scroller.evaluate((el) => (el as unknown as { __mark?: number }).__mark)).toBe(9);
  });

  test("closing a panel keeps the others; closing the last returns to the library", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en&p2=Exodus.1&lang2=en");
    await page.locator('section[data-panel-id="p1"]').getByRole("button", { name: "Close this text" }).click();
    await expect(panels(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\/Exodus\.1\?lang=en&aliyot=0$/);
    await page.getByRole("button", { name: "Back to the library" }).click();
    await expect(page).toHaveURL(/\/texts$/);
  });
});

// @feature SHL-061 @feature RTE-044 @feature CON-004 @feature CON-009
test.describe("phones (old single-panel mode)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // @feature SHL-049
  test("a citation replaces the text instead of opening beside it", async ({ page }) => {
    await open(page, "/Jerusalem_Talmud_Berakhot.1.1?lang=en");
    await page.locator('a[data-sefaria-ref="Deuteronomy 8:10"]', { hasText: "Deut." }).first().click();
    await expect(page).toHaveURL(/\/Deuteronomy\.8\.10/);
    expect(new URL(page.url()).searchParams.get("p2")).toBeNull();
  });

  test("only the first panel shows", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en&p2=Exodus.1&lang2=en");
    await expect(page.locator('section[data-panel-id="p1"]')).toBeVisible();
    await expect(page.locator('section[data-panel-id="p2"]')).toBeHidden();
  });

  test("the sidebar is a sheet over the bottom 54% with the selected verse readable above it (verified on sefaria.org)", async ({ page }) => {
    await open(page, "/Genesis.1.3?lang=en&with=all");
    const sheet = await page.getByRole("complementary").boundingBox();
    expect(Math.round(sheet!.height)).toBeGreaterThan(450); // 54vh of 844 = 456
    expect(Math.round(sheet!.height)).toBeLessThan(462);
    expect(Math.round(sheet!.y + sheet!.height)).toBe(844);
    const verse = await page.locator('[role="group"][data-ref="Genesis 1:3"]').boundingBox();
    expect(verse!.y + verse!.height).toBeLessThan(sheet!.y);
  });
});

