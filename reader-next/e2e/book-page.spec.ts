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
    await expect(page.getByRole("heading", { level: 3 }).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("link", { name: /Select/ }).first()).toBeVisible();
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
});
