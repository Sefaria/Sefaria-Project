import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature BOK-001 @feature BOK-002 @feature BOK-003 @feature BOK-005 @feature BOK-007 @feature BOK-018 @feature RTE-048
test.describe("a book's own page (verified against sefaria.org)", () => {
  test("/Genesis: title, category, Start Reading, chapters and Torah portions, description, related topics", async ({ page }) => {
    await open(page, "/Genesis");
    await expect(page.getByRole("heading", { level: 1, name: "Genesis" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tanakh" })).toHaveAttribute("href", "https://www.sefaria.org/texts/Tanakh");
    await expect(page.getByRole("link", { name: "Start Reading" })).toHaveAttribute("href", "/Genesis.1");
    await expect(page.getByRole("link", { name: "50", exact: true })).toHaveAttribute("href", "/Genesis.50");
    await expect(page.getByText("Torah Portions")).toBeVisible();
    await expect(page.getByRole("complementary")).toContainText("is the first book of the Torah");
    await expect(page.getByRole("region", { name: "Related Topics" })).toContainText("Abraham");
  });

  test("a chapter link opens the text; reading there makes the page offer Continue Reading", async ({ page }) => {
    await open(page, "/Genesis");
    await page.getByRole("link", { name: "5", exact: true }).first().click();
    await expect(page).toHaveURL(/\/Genesis\.5/);
    await expect(page.locator('[role="group"][data-ref="Genesis 5:1"]')).toBeVisible({ timeout: 25_000 });
    await page.getByRole("link", { name: "Genesis 5" }).click(); // the header's title leads to the book page
    await expect(page).toHaveURL(/\/Genesis$/);
    await expect(page.getByRole("link", { name: "Continue Reading" })).toHaveAttribute("href", /\/Genesis\.5/);
  });

  test("the Versions tab lists the versions, in the URL", async ({ page }) => {
    await open(page, "/Genesis");
    await page.getByRole("link", { name: "Versions" }).click();
    await expect(page).toHaveURL(/\/Genesis\?tab=versions/);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({ timeout: 25_000 });
    // the title is the link (sefaria.org has no Select button on this page)
    await expect(page.getByRole("link", { name: /Select/ })).toHaveCount(0);
  });

  // sefaria.org's book-page VersionBlock, measured with getComputedStyle on /Berakhot?tab=versions (2026-11-11)
  test("the Versions tab looks as on sefaria.org: rows, title links, language pills, plain grey facts, the sidebar, the tabs", async ({ page }) => {
    await open(page, "/Berakhot?tab=versions");
    const rows = page.locator("[data-version-row]");
    await expect(rows.first()).toBeVisible({ timeout: 25_000 });
    // order: priority, then title (the old VersionsList); the title links to the version's own first section
    const titles = (await rows.locator("[data-version-row-title]").allTextContents()).slice(0, 4);
    expect(titles).toEqual(["William Davidson Edition - Vocalized Aramaic", "William Davidson Edition - Aramaic", "William Davidson Edition - English", expect.stringMatching(/^Tractate Berakot/)]);
    await expect(rows.first().getByRole("link").first()).toHaveAttribute("href", "/Berakhot.2a?vhe=hebrew|William_Davidson_Edition_-_Vocalized_Aramaic");
    await expect(rows.locator("[data-version-row-badge]").first()).toHaveText("Hebrew");
    await expect(rows.nth(2).locator("[data-version-row-badge]")).toHaveText("English");
    const style = (sel: string, props: string[]) =>
      page.locator(sel).first().evaluate((el, ps) => Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])), props);
    expect(await style("[data-version-row-title] a", ["color", "text-decoration-line", "font-size", "line-height"])).toEqual({ color: "rgb(0, 0, 0)", "text-decoration-line": "none", "font-size": "24px", "line-height": "29px" });
    const badge = await style("[data-version-row-badge]", ["background-color", "color", "font-size", "padding"]);
    expect(badge).toEqual({ "background-color": "rgb(237, 237, 236)", color: "rgb(102, 102, 102)", "font-size": "14px", padding: "5px 10px" });
    expect(await style("[data-version-row-details] a", ["color", "text-decoration-line", "font-size"])).toEqual({ color: "rgb(102, 102, 102)", "text-decoration-line": "none", "font-size": "14px" });
    expect(await style("[data-version-row-notes]", ["color", "font-size", "line-height"])).toEqual({ color: "rgb(102, 102, 102)", "font-size": "16px", "line-height": "19px" });
    // a 1px #ccc rule between rows, none above the first
    expect(await rows.nth(0).evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("none");
    expect(await rows.nth(1).evaluate((el) => [getComputedStyle(el).borderTopWidth, getComputedStyle(el).borderTopStyle, getComputedStyle(el).borderTopColor, getComputedStyle(el).paddingTop])).toEqual(["1px", "solid", "rgb(204, 204, 204)", "20px"]);
    // the badge sits at the far side of the title's line
    const [row, pill] = [await rows.first().boundingBox(), await rows.first().locator("[data-version-row-badge]").boundingBox()];
    expect(Math.abs(row!.x + row!.width - (pill!.x + pill!.width))).toBeLessThan(2);
    // the sidebar stays on this tab
    await expect(page.getByRole("complementary")).toContainText("Download Text");
    // tabs: 22px, the current one black over a 4px #ccc bar; a mouse click leaves no focus ring, the keyboard's shows
    const versionsTab = page.getByRole("navigation", { name: "Book sections" }).getByRole("link", { name: "Versions" });
    expect(await versionsTab.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).color, getComputedStyle(el).borderBottom])).toEqual(["22px", "rgb(0, 0, 0)", "4px solid rgb(204, 204, 204)"]);
    await page.getByRole("navigation", { name: "Book sections" }).getByRole("link", { name: "Contents" }).click();
    await versionsTab.click();
    await expect(page).toHaveURL(/\?tab=versions/);
    expect(await versionsTab.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(await versionsTab.evaluate((el) => (el.matches(":focus-visible") ? getComputedStyle(el).outlineStyle : "not focused"))).toBe("solid");
  });

  test("the Versions tab in the Hebrew interface: Hebrew titles and language names", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/Berakhot?tab=versions");
    const rows = page.locator("[data-version-row]");
    await expect(rows.first().locator("[data-version-row-title]")).toHaveText("מהדורת וויליאם דייוידסון - ארמית המנוקד", { timeout: 25_000 });
    await expect(rows.first().locator("[data-version-row-badge]")).toHaveText("עברית");
    await expect(rows.nth(2).locator("[data-version-row-badge]")).toHaveText("אנגלית");
    await expect(page.getByRole("complementary")).toContainText("הורדת טקסט");
  });

  test("Talmud: the William Davidson Edition credit and chapters of dafs; a mis-spelt title goes to the real one; a node is a text", async ({ page }) => {
    await open(page, "/Berakhot");
    await expect(page.getByRole("link", { name: "The William Davidson Edition" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chapter 1; MeEimatai" })).toBeVisible();
    await open(page, "/genesis");
    await expect(page).toHaveURL(/\/Genesis$/);
    await open(page, "/Pesach_Haggadah,_Kadesh");
    await expect(page.locator('[role="group"]').first()).toBeVisible({ timeout: 25_000 });
    await expect(page).toHaveURL(/Kadesh/);
  });
});

// @feature LIB-002 @feature BOK-002
test.describe("the language button on library pages", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("turns the page's content to Hebrew, right to left, and back; the address does not change", async ({ page }) => {
    await open(page, "/Berakhot");
    await expect(page.getByRole("heading", { level: 1, name: "Berakhot" })).toBeVisible();
    await page.getByRole("button", { name: "Hebrew Language Toggle Icon" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "ברכות" })).toBeVisible();
    await expect(page.getByRole("link", { name: "מאימתי" }).or(page.getByText("מאימתי")).first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/Berakhot");
    await page.getByRole("button", { name: "English Language Toggle Icon" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Berakhot" })).toBeVisible();
  });
  test("About This Text: composed place and date; an author for a dictionary", async ({ page }) => {
    await open(page, "/Berakhot");
    await expect(page.getByText("Talmudic Babylon, c.450 – c.550 CE").locator("visible=true")).toHaveCount(1);
    await open(page, "/Jastrow");
    await expect(page.getByRole("link", { name: "Marcus Jastrow" })).toBeVisible();
    await expect(page.getByText("Philadelphia, c.1883 – c.1903 CE").locator("visible=true")).toHaveCount(1);
  });
});

// @feature BOK-002 @feature BOK-006 @feature LIB-036
test.describe("a book page on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("keeps the site header; the About text sits under Start Reading, with no 'About This Text' module", async ({ page }) => {
    await open(page, "/Berakhot");
    await expect(page.getByRole("banner")).toBeVisible();
    const composed = page.getByText("Composed:").first();
    await expect(composed).toBeVisible();
    const start = await page.getByRole("link", { name: "Start Reading" }).boundingBox();
    const tabs = await page.getByRole("link", { name: "Contents" }).boundingBox();
    const c = await composed.boundingBox();
    expect(c!.y).toBeGreaterThan(start!.y);
    expect(c!.y).toBeLessThan(tabs!.y);
    await expect(page.getByRole("heading", { name: "About This Text" })).toBeHidden();
  });

  test("the Versions tab: 16px tabs, rows with their pills, the sidebar under the page", async ({ page }) => {
    await open(page, "/Berakhot?tab=versions");
    await expect(page.locator("[data-version-row]").first()).toBeVisible({ timeout: 25_000 });
    const tab = page.getByRole("navigation", { name: "Book sections" }).getByRole("link", { name: "Versions" });
    expect(await tab.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).paddingBottom])).toEqual(["16px", "18px"]);
    await expect(page.locator("[data-version-row-badge]").first()).toBeVisible();
    await expect(page.getByRole("complementary")).toContainText("Download Text");
  });
});
