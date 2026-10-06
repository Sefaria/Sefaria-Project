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

  test("the old client's gapped numbering (?with=all&p3=…) still opens every panel, and is rewritten sequentially", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all&p3=Exodus.1&lang3=en");
    await expect(panels(page)).toHaveCount(2);
    await page.locator('section[data-panel-id="p2"] [data-reader-scroller]').hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => new URL(page.url()).search).toMatch(/&p2=Exodus\.1\.\d+&lang2=en/);
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
    await expect(page).toHaveURL(/p2=Exodus\.1\.1&lang2=en&w2=all/);
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
    await expect(page).toHaveURL(/\/Jerusalem_Talmud_Berakhot\.1\.1\?lang=en&p2=Deuteronomy\.8\.10/);
    await expect(page.locator('section[data-panel-id="p2"] [role="group"][data-ref="Deuteronomy 8:10"]')).toBeInViewport();
    await expect(page.locator('section[data-panel-id="p1"] [role="group"][data-ref="Jerusalem Talmud Berakhot 1:1:1"]')).toBeVisible();
    // I18-003: the new panel takes keyboard focus on its first control
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[data-panel-id]")?.getAttribute("data-panel-id"))).toBe("p2");
  });

  // @feature SHL-040
  test("when the row overflows, a panel that opens beside the first is scrolled into view", async ({ page }) => {
    await open(page, "/Jerusalem_Talmud_Berakhot.1.1?lang=en&p2=Genesis.1&p3=Exodus.1&p4=Leviticus.1&p5=Numbers.1");
    await page.locator('section[data-panel-id="p1"] a[data-sefaria-ref="Deuteronomy 8:10"]', { hasText: "Deut." }).first().click();
    await expect(panels(page)).toHaveCount(6);
    await expect(page.locator('section [role="group"][data-ref="Deuteronomy 8:10"]')).toBeInViewport({ ratio: 0.3 });
  });

  // @feature SHL-048 @feature SHL-033
  test("closing a panel keeps the others; closing the last returns to the library", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en&p2=Exodus.1&lang2=en");
    await page.locator('section[data-panel-id="p1"]').getByRole("button", { name: "Close this text" }).click();
    await expect(panels(page)).toHaveCount(1);
    await expect(page).toHaveURL(/\/Exodus\.1\?lang=en$/);
    await page.getByRole("button", { name: "Back to the library" }).click();
    await expect(page).toHaveURL(/\/$/);
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

