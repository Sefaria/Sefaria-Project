import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const main = (page: Page) => page.getByRole("main");
const side = (page: Page) => page.getByRole("complementary").first();
const cards = (page: Page) => main(page).locator('a[data-anl-event="navto_topic:click:click"]');

// @feature TOP-014 @feature TOP-001
test.describe("All Topics A–Z (verified against sefaria.org 2026-11-04)", () => {
  test("/topics/all/a: the title, the filter box, the letters, and the topics starting with A in alphabetical order", async ({ page }) => {
    await open(page, "/topics/all/a");
    await expect(page).toHaveTitle("Explore Jewish Texts by Topic - a | The Sefaria Library");
    await expect(main(page).getByRole("heading", { level: 1, name: "All Topics" })).toBeVisible();
    await expect(main(page).getByPlaceholder("Search Topics")).toBeVisible();
    const letters = main(page).getByRole("link", { name: "B", exact: true }).locator("..").locator("a");
    await expect(letters).toHaveCount(26);
    await expect(letters.nth(1)).toHaveAttribute("href", "/topics/all/b");
    await expect(cards(page).nth(0)).toHaveText("Aaron");
    await expect(cards(page).nth(1)).toHaveText("Aaron and his Sons");
    const names = await cards(page).allInnerTexts();
    expect(names.length).toBeGreaterThan(50);
    expect(names.every((n) => n.toLowerCase().startsWith("a"))).toBe(true);
    await expect(cards(page).nth(0)).toHaveAttribute("href", /\/topics\/aaron$/);
    const titles = await side(page).locator("h2").allInnerTexts();
    expect(titles.filter(Boolean).slice(0, 3)).toEqual(["Trending Topics", "Get the Mobile App", "Support Sefaria"]);
  });

  test("a letter opens its page in the app; the letter is taken as written (/topics/all/A has none, as the old site)", async ({ page }) => {
    await open(page, "/topics/all/a");
    await main(page).getByRole("link", { name: "Z", exact: true }).click();
    await expect(page).toHaveURL(/\/topics\/all\/z$/);
    await expect(cards(page).nth(0)).toHaveText(/^Z/);
    await open(page, "/topics/all/A");
    await expect(main(page).getByText("There are no topics here.")).toBeVisible();
  });

  test("the filter: from two letters, any title of any topic; Reset clears it", async ({ page }) => {
    await open(page, "/topics/all/b");
    const input = main(page).getByPlaceholder("Search Topics");
    await input.fill("g");
    await expect(cards(page).nth(0)).toHaveText(/^B/); // one letter does not filter
    await input.fill("golden calf");
    await expect(cards(page).filter({ hasText: "Aaron and the Golden Calf" })).toHaveCount(1, { timeout: 30_000 });
    const names = await cards(page).allInnerTexts();
    expect(names.some((n) => n.startsWith("B"))).toBe(false);
    await main(page).getByRole("button", { name: "Reset topic filter" }).click();
    await expect(input).toHaveValue("");
    await expect(cards(page).nth(0)).toHaveText(/^B/);
  });

  test("only one character is a letter page: more is not found", async ({ request }) => {
    expect((await request.get("/topics/all/ab")).status()).toBe(404);
  });
});

// @feature TOP-014 @feature I18-013
test.describe("All Topics A–Z in the Hebrew interface", () => {
  test("א–ת (with ם, as the old list), the Hebrew titles, cards from the right", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/topics/all/%D7%90");
    await expect(page).toHaveTitle("עיון בארון הספרים היהודי לפי נושא - א | האוסף של ספריא");
    await expect(main(page).getByRole("heading", { level: 1, name: "כל הנושאים" })).toBeVisible();
    await expect(main(page).getByPlaceholder("חיפוש נושאים")).toBeVisible();
    const letters = main(page).getByRole("link", { name: "ב", exact: true }).locator("..").locator("a");
    await expect(letters).toHaveCount(23);
    await expect(main(page).getByRole("link", { name: "ם", exact: true })).toBeVisible();
    const names = await cards(page).allInnerTexts();
    expect(names.length).toBeGreaterThan(20);
    expect(names.every((n) => n.startsWith("א"))).toBe(true);
    // an English description in the Hebrew interface is a left-to-right block (the old .int-he.enInHe)
    const en = main(page).locator('[lang="en"][dir="ltr"]').first();
    if (await en.count()) expect(await en.evaluate((e) => getComputedStyle(e).display)).toBe("block");
  });
});
