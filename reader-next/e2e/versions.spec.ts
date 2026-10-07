import { expect, test } from "@playwright/test";
import { open, segmentTop } from "./helpers";

const side = (page: import("@playwright/test").Page) => page.getByRole("complementary");

// @feature VER-009 @feature VER-012 @feature VER-003 @feature TXD-013 Reader header title and version label
test.describe("choosing a translation from the sidebar", () => {
  test("lists every translation by language, English (n) first, the current one marked", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=Translations");
    const english = side(page).getByRole("region", { name: "English" });
    await expect(english).toBeVisible({ timeout: 20_000 });
    await expect(english.getByText(/\(\d+\)/).first()).toBeVisible();
    await expect(english.getByRole("article").first()).toContainText("Currently Selected");
  });

  test("Select swaps the text in place, keeps the reader's verse still, and stays in Translations", async ({ page }) => {
    await open(page, "/Genesis.1.5?lang=en&with=Translations");
    const english = side(page).getByRole("region", { name: "English" });
    await expect(english).toBeVisible({ timeout: 20_000 });
    const before = await segmentTop(page, "Genesis 1:5");
    await english.getByRole("link", { name: "Select The Koren Jerusalem Bible" }).click();
    await expect(page).toHaveURL(/ven=english\|The_Koren_Jerusalem_Bible/);
    await expect(page.locator('[role="group"][data-ref="Genesis 1:1"]')).toContainText("IN THE BEGINNING", { timeout: 20_000 });
    await page.waitForTimeout(300);
    expect(Math.abs((await segmentTop(page, "Genesis 1:5")) - before)).toBeLessThan(2);
    await expect(page).toHaveURL(/with=Translations/);
    await expect(page.locator("main header").first()).toContainText("The Koren Jerusalem Bible"); // the header names the version
    await expect(english.getByRole("article").first()).toContainText("Koren");
    await expect(english.getByRole("article").first()).toContainText("Currently Selected");
  });

  test("choosing a translation always makes the panel bilingual, from any language (verified on sefaria.org)", async ({ page }) => {
    for (const lang of ["en", "he", "bi"]) {
      await page.context().clearCookies(); // the previous round remembered Koren as the preference
      await open(page, `/Genesis.1.1?lang=${lang}&with=Translations`);
      const english = side(page).getByRole("region", { name: "English" });
      await expect(english).toBeVisible({ timeout: 20_000 });
      await english.getByRole("link", { name: "Select The Koren Jerusalem Bible" }).click();
      await expect(page).toHaveURL(/lang=bi/);
    }
  });

  // @feature VER-011
  test("Open Text opens the passage in that translation in a new panel (VERIFIED on sefaria.org)", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=Translations");
    const koren = side(page).getByRole("region", { name: "English" }).getByRole("article").filter({ hasText: "The Koren Jerusalem Bible" });
    await koren.getByText("The Koren Jerusalem Bible").first().click();
    await koren.getByRole("link", { name: "Open Text" }).click();
    await expect(page).toHaveURL(/\/Genesis\.1\.1\?lang=en&aliyot=0&p2=Genesis\.1\.1&ven2=english\|The_Koren_Jerusalem_Bible&lang2=en&aliyot2=0$/);
    await expect(page.locator("section[data-panel-id]")).toHaveCount(2);
    await expect(side(page)).toHaveCount(0);
  });
});

// @feature VER-014 @feature VER-002 @feature VER-001 @feature I18-001
test.describe("the reader's preferences decide the translation when the URL names none", () => {
  const prefsCookie = (value: unknown) => ({ name: "version_preferences_by_corpus", value: encodeURIComponent(JSON.stringify(value)), url: "http://localhost:3100" });
  const header = (page: import("@playwright/test").Page) => page.locator("main header").first();

  test("a corpus preference applies to another book of the same corpus, on the server render too", async ({ page, request }) => {
    await page.context().addCookies([prefsCookie({ Tanakh: { en: "The Koren Jerusalem Bible" } })]);
    await open(page, "/Exodus.1.1?lang=en");
    await expect(header(page)).toContainText("The Koren Jerusalem Bible");
    await expect(page.locator('[role="group"][data-ref="Exodus 1:1"]')).toContainText(/these are the names of the children/i);
    // Server-rendered: the first response already carries the preferred translation.
    const html = await (await request.get("/Exodus.1.1?lang=en", { headers: { cookie: `version_preferences_by_corpus=${encodeURIComponent(JSON.stringify({ Tanakh: { en: "The Koren Jerusalem Bible" } }))}` } })).text();
    expect(html).toContain("The Koren Jerusalem Bible");
  });

  test("a translation-language preference picks that language's best translation", async ({ page }) => {
    await page.context().addCookies([{ name: "translation_language_preference", value: "es", url: "http://localhost:3100" }]);
    await open(page, "/Exodus.1.1?lang=en");
    await expect(header(page)).toContainText("[es]");
  });

  test("a preference for a book of another corpus, or a version the text lacks, is ignored", async ({ page }) => {
    await page.context().addCookies([prefsCookie({ Bavli: { en: "The Koren Jerusalem Bible" }, Tanakh: { en: "No Such Version" } })]);
    await open(page, "/Exodus.1.1?lang=en");
    await expect(header(page)).toContainText("Revised JPS, 2023");
  });

  test("an explicit ven in the URL beats the preference", async ({ page }) => {
    await page.context().addCookies([prefsCookie({ Tanakh: { en: "The Koren Jerusalem Bible" } })]);
    await open(page, "/Exodus.1.1?lang=en&ven=english|The_Contemporary_Torah,_Jewish_Publication_Society,_2006");
    await expect(header(page)).toContainText("The Contemporary Torah");
  });

  test("choosing a translation is remembered for the whole corpus", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=Translations");
    const english = side(page).getByRole("region", { name: "English" });
    await expect(english).toBeVisible({ timeout: 20_000 });
    await english.getByRole("link", { name: "Select The Koren Jerusalem Bible" }).click();
    await expect(header(page)).toContainText("The Koren Jerusalem Bible");
    await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === "version_preferences_by_corpus")?.value).toContain("Koren");
    await open(page, "/Exodus.1.1?lang=en");
    await expect(header(page)).toContainText("The Koren Jerusalem Bible");
  });
});

// @feature VER-013 @feature VER-010 @feature SHL-052
test.describe("previewing a translation in the sidebar (Translation Open)", () => {
  test("clicking a preview shows that translation alone; back returns to the list; the text stays as it was", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=Translations");
    const english = side(page).getByRole("region", { name: "English" });
    await expect(english).toBeVisible({ timeout: 20_000 });
    await english.getByRole("link", { name: "Preview The Koren Jerusalem Bible" }).click();
    await expect(page).toHaveURL(/vside=The_Koren_Jerusalem_Bible\|en/);
    await expect(page).toHaveURL(/with=Translation(\+|%20)Open/);
    await expect(side(page).getByRole("heading", { name: "The Koren Jerusalem Bible" })).toBeVisible();
    await expect(side(page)).toContainText("IN THE BEGINNING God created the heaven and the earth.");
    await expect(page.locator("main header").first()).toContainText("Revised JPS, 2023"); // previewing does not change the reader's text
    await side(page).getByRole("link", { name: "Translations" }).click();
    await expect(page).not.toHaveURL(/vside/);
    await expect(side(page).getByRole("region", { name: "English" })).toBeVisible();
  });

  test("Open shows the passage in that translation in a new panel after the reader's", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=Translation%20Open&vside=The_Koren_Jerusalem_Bible|en");
    await side(page).getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/&p2=Genesis\.1\.1&ven2=english\|The_Koren_Jerusalem_Bible&lang2=en&aliyot2=0$/);
    await expect(page.locator("section[data-panel-id]")).toHaveCount(2);
    await expect(side(page)).toHaveCount(0);
  });

  test("a link without the language (the old site's anchor form) opens the same view", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&vside=The_Koren_Jerusalem_Bible&with=Translation%20Open");
    await expect(side(page).getByRole("heading", { name: "The Koren Jerusalem Bible" })).toBeVisible({ timeout: 20_000 });
  });
});
