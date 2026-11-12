import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const main = (page: Page) => page.getByRole("main");
const side = (page: Page) => page.getByRole("complementary").first();
const cards = (page: Page) => main(page).locator('[data-anl-feature_name="Main"] a[data-anl-event="navto_topic:click:click"]');

// @feature TOP-013 @feature TOP-012 @feature TOP-001
test.describe("a topic category (verified against sefaria.org 2026-11-04)", () => {
  test("Torah Portions: its title, the portions in reading order without 'Parashat', each card a link to the topic", async ({ page }) => {
    await open(page, "/topics/category/torah-portions");
    await expect(page).toHaveTitle("Torah Portions | Texts from the Sefaria Library");
    await expect(main(page).getByRole("heading", { level: 1, name: "Torah Portions" })).toBeVisible();
    await expect(cards(page)).toHaveCount(54);
    await expect(cards(page).nth(0)).toHaveText("Bereshit");
    await expect(cards(page).nth(1)).toHaveText("Noach");
    await expect(cards(page).nth(53)).toHaveText("VeZot HaBerakhah");
    // a single topic is this client's page too: a routed link to /topics/<slug>
    await expect(cards(page).nth(0)).toHaveAttribute("href", /\/topics\/parashat-bereshit$/);
    await expect(cards(page).nth(0)).toHaveAttribute("data-anl-text", "Bereshit");
    // each card: its description under the title, at most three lines
    const descs = main(page).locator('[data-anl-feature_name="Main"] a + div');
    await expect(descs).toHaveCount(54);
    await expect(descs.nth(0)).toContainText("Bereshit");
    await expect(descs.nth(1)).toContainText(/Noah|Noach|flood/i);
    // every card has a description, clamped to three 18px lines (non-empty, at most 54px)
    const heights = await descs.evaluateAll((els) => els.map((e) => [e.textContent?.trim().length ?? 0, Math.round(e.getBoundingClientRect().height)]));
    expect(heights.filter(([len]) => len === 0)).toEqual([]);
    expect(heights.filter(([, h]) => h < 18 || h > 54)).toEqual([]);
    // the page reports as the old TopicCategory
    await expect(page.locator('[data-anl-project="topics"]')).toHaveAttribute("data-anl-panel_category", "Topic Landing");
  });

  test("two cards to a row with a hairline over the first row; title 40px over the cards (measured)", async ({ page }) => {
    await open(page, "/topics/category/authors");
    const first = cards(page).nth(0), second = cards(page).nth(1), third = cards(page).nth(2);
    const [a, b, c] = [await first.boundingBox(), await second.boundingBox(), await third.boundingBox()];
    expect(Math.round(a!.y)).toBe(Math.round(b!.y));
    expect(c!.y).toBeGreaterThan(a!.y);
    expect(Math.abs(b!.x - a!.x - 342.5)).toBeLessThanOrEqual(1); // (665 - 20) / 2 + 20
    const card = first.locator("..");
    expect(await card.evaluate((e) => getComputedStyle(e).borderTopColor)).toBe("rgb(237, 237, 236)");
    const h1 = await main(page).getByRole("heading", { level: 1 }).boundingBox();
    expect(Math.round((await card.boundingBox())!.y - h1!.y)).toBe(40);
  });

  test("the sidebar: About Topics, the Study Companion (Torah Portions, English), Trending Topics, Sponsor A Day of Learning", async ({ page }) => {
    await open(page, "/topics/category/torah-portions");
    const titles = await side(page).locator("h2").allInnerTexts();
    expect(titles.filter(Boolean).slice(0, 4)).toEqual(["About Topics", "Study Companion", "Trending Topics", "Sponsor A Day of Learning"]);
    await expect(side(page).getByRole("link", { name: /Sign Up/ })).toHaveAttribute("href", "https://learn.sefaria.org/weekly-parashah/");
    await expect(side(page).getByRole("link", { name: /Sponsor A Day/ })).toHaveAttribute("href", "https://donate.sefaria.org/sponsor?c_src=NavSidebar-SponsorADay");
    await open(page, "/topics/category/authors");
    await expect(side(page).getByRole("heading", { name: "Study Companion" })).toHaveCount(0);
  });

  test("an unknown category is not found (the old page's 404): the reader sees the shared 'Page Not Found'", async ({ page, request }) => {
    expect((await request.get("/topics/category/no-such-category")).status()).toBe(404);
    await open(page, "/topics/category/no-such-category");
    await expect(page.getByRole("heading", { level: 1, name: "Page Not Found" })).toBeVisible();
  });
});

// @feature TOP-013 @feature I18-013
test.describe("a topic category in the Hebrew interface", () => {
  test("Hebrew title and cards, Hebrew order; no Study Companion", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/topics/category/torah-portions");
    await expect(page).toHaveTitle("פרשות השבוע | מקורות מתוך ספריית ספריא");
    await expect(main(page).getByRole("heading", { level: 1, name: "פרשות השבוע" })).toBeVisible();
    await expect(cards(page).nth(0)).toHaveText("בראשית");
    await expect(side(page).getByRole("heading", { name: "Study Companion" })).toHaveCount(0);
    await expect(side(page).getByRole("heading", { name: 'אודות "נושאים"' })).toBeVisible();
    // the first card sits at the right
    const [a, b] = [await cards(page).nth(0).boundingBox(), await cards(page).nth(1).boundingBox()];
    expect(a!.x).toBeGreaterThan(b!.x);
  });
});

// @feature TOP-013
test.describe("a topic category on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  test("one card per row", async ({ page }) => {
    await open(page, "/topics/category/authors");
    const [a, b] = [await cards(page).nth(0).boundingBox(), await cards(page).nth(1).boundingBox()];
    expect(Math.round(a!.x)).toBe(Math.round(b!.x));
    expect(b!.y).toBeGreaterThan(a!.y);
  });
});
