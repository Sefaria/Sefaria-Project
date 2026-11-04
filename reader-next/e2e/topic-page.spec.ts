import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// The single topic page, as a reader sees it on sefaria.org (surveyed with Playwright 2026-11-04). Data through the API cassette.
const main = (page: Page) => page.getByRole("main");
const side = (page: Page) => page.locator("aside").last();
const tabs = (page: Page) => page.getByRole("tab");
const cards = (page: Page) => page.locator("[data-source-card]");

// @feature TOP-015 @feature TOP-017 @feature TOP-020 @feature TOP-001 @feature TOP-023 @feature TOP-029
test.describe("a topic's page (Moses)", () => {
  test("title, category, description and tabs; the address written as the old site wrote it", async ({ page }) => {
    await open(page, "/topics/moses");
    await expect(page).toHaveTitle("Moses | Texts from the Sefaria Library");
    await expect(main(page).getByRole("heading", { level: 1, name: "Moses" })).toBeVisible();
    const category = main(page).getByRole("link", { name: "Biblical Figures" });
    await expect(category).toHaveAttribute("href", "/topics/category/biblical-figures");
    await expect(main(page).getByText(/Moses was the greatest prophet in the biblical tradition/)).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Yitro" }).first()).toHaveAttribute("href", "https://www.sefaria.org/topics/yitro");
    await expect(tabs(page)).toHaveText(["Notable Sources", "Sources"]);
    await expect(tabs(page).first()).toHaveAttribute("aria-selected", "true");
    // the "A" at the far end; no funnel on Notable Sources
    await expect(page.getByRole("button", { name: "A", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Filter and sort" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/topics\/moses\?sort=Relevance&tab=notable-sources$/);
    // the old .topicPanel batch
    await expect(page.locator('[data-anl-batch*="\\"project\\":\\"topics\\""]').first()).toHaveAttribute("data-anl-batch", '{"project":"topics","content_lang":"english","panel_category":"biblical-figures"}');
  });

  test("Notable Sources: the first curated source open — title, its book's category, the prompt, the text and the citation", async ({ page }) => {
    await open(page, "/topics/moses");
    const first = cards(page).first();
    await expect(first.locator("summary")).toContainText("An Unmatched Prophet");
    await expect(first.locator("summary")).toContainText("TANAKH");
    await expect(first.locator("details")).toHaveAttribute("open", "");
    await expect(first).toContainText("is considered to have been the greatest prophet");
    await expect(first).toContainText("Never again did there arise in Israel a prophet like Moses");
    await expect(first.getByRole("link", { name: "Deuteronomy 34:10-12" })).toHaveAttribute("href", "/Deuteronomy.34.10-12");
    // the others closed until opened
    await expect(cards(page).nth(1).locator("details")).not.toHaveAttribute("open", "");
    await cards(page).nth(1).locator("summary").click();
    await expect(cards(page).nth(1)).toContainText("Pirkei Avot 1:1");
    // each source carries the old analytics batch
    await expect(first.locator("..")).toHaveAttribute("data-anl-batch", '{"position":0,"ai":"human","item_id":"Deuteronomy 34:10-12","content_id":"Deuteronomy","content_type":"Tanakh|Torah"}');
    // the colour bar is Tanakh's
    expect(await first.locator("summary > div").evaluate((e) => getComputedStyle(e).borderInlineStartColor)).toBe("rgb(0, 78, 95)");
  });

  test("measured layout: 680px column from x=90, title 60px under the strip, the 420px grey side column", async ({ page }) => {
    await open(page, "/topics/moses");
    const h1 = (await main(page).getByRole("heading", { level: 1 }).boundingBox())!;
    expect(Math.round(h1.x)).toBe(90);
    const tabList = (await page.getByRole("tablist").locator("..").boundingBox())!;
    expect(Math.round(tabList.width)).toBe(680);
    const box = (await side(page).boundingBox())!;
    expect(Math.round(box.width)).toBe(420);
    expect(Math.round(box.x)).toBe(860);
    expect(await side(page).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(251, 251, 250)");
  });
});

// @feature TOP-020 @feature TOP-022 @feature TOP-021
test.describe("tabs, sort, filter and language", () => {
  test("Sources: a new history entry; the funnel opens the filter and sort bar; the sort is in the address", async ({ page }) => {
    await open(page, "/topics/moses");
    await tabs(page).nth(1).click();
    await expect(page).toHaveURL(/\?sort=Relevance&tab=sources$/);
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    // Sources: no curated titles, 20 at first
    await expect(cards(page)).toHaveCount(20);
    await expect(cards(page).first().locator("details")).toHaveCount(0);
    await page.getByRole("button", { name: "Filter and sort" }).click();
    await expect(main(page).getByText("Sort by")).toBeVisible();
    await page.getByRole("button", { name: "Chronological" }).click();
    await expect(page).toHaveURL(/\?sort=Chronological&tab=sources$/);
    await expect(page.getByRole("button", { name: "Chronological" })).toHaveAttribute("aria-pressed", "true");
    // the oldest first: the Torah
    await expect(cards(page).first()).toContainText(/Exodus|Genesis/);
    await main(page).locator('input[name="filterableListInput"]').fill("rashi on");
    await expect(cards(page).first().getByRole("link").last()).toHaveText(/^Rashi on /);
    // back: the sort, then the tab
    await page.goBack();
    await expect(page).toHaveURL(/\?sort=Relevance&tab=sources$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?sort=Relevance&tab=notable-sources$/);
    await expect(tabs(page).first()).toHaveAttribute("aria-selected", "true");
  });

  test("more sources as the reader scrolls (20 at a time)", async ({ page }) => {
    await open(page, "/topics/moses?sort=Relevance&tab=sources");
    await expect(cards(page)).toHaveCount(20);
    await cards(page).nth(19).scrollIntoViewIfNeeded();
    await expect(cards(page)).toHaveCount(40);
  });

  test("a shared link to a tab opens that tab; an unknown tab is the first", async ({ page }) => {
    await open(page, "/topics/moses?tab=sources&sort=Chronological");
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\?sort=Chronological&tab=sources$/);
    await open(page, "/topics/moses?tab=sheets");
    await expect(page).toHaveURL(/\?sort=Relevance&tab=notable-sources$/);
  });

  test("the language choice: Source shows the Hebrew, Source with Translation both, Hebrew first", async ({ page }) => {
    await open(page, "/topics/moses");
    await page.getByRole("button", { name: "A", exact: true }).click();
    await expect(page.getByLabel("Translation", { exact: true })).toBeChecked();
    await page.getByText("Source", { exact: true }).click();
    const body = cards(page).first().locator('[lang="he"][dir="rtl"]').first();
    await expect(body).toContainText("וְלֹא");
    await expect(page.locator('[data-anl-batch^="{\\"project\\""]')).toHaveAttribute("data-anl-batch", /"content_lang":"hebrew"/);
    await page.getByRole("button", { name: "A", exact: true }).click();
    await page.getByText("Source with Translation").click();
    const texts = cards(page).first().locator("a span[lang]");
    await expect(texts.nth(0)).toHaveAttribute("lang", "he");
    await expect(texts.nth(1)).toHaveAttribute("lang", "en");
  });
});

// @feature TOP-025 @feature TOP-035
test.describe("the side column", () => {
  test("picture and caption, Learn More (a new tab), Related first with ten links and More; groups by their singular title", async ({ page }) => {
    await open(page, "/topics/moses");
    await expect(side(page).getByRole("img", { name: /Moses Strikes the Rock/ })).toBeVisible();
    const wiki = side(page).getByRole("link", { name: "Wikipedia" });
    await expect(wiki).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Moses");
    await expect(wiki).toHaveAttribute("target", "_blank");
    const heads = await side(page).getByRole("heading", { level: 2 }).allInnerTexts();
    expect(heads.slice(0, 3)).toEqual(["Learn More", "Related", "Opposed"]);
    expect(heads.indexOf("Parents")).toBeLessThan(heads.indexOf("Parent-in-Law"));
    const related = side(page).locator("section, div").filter({ has: page.getByRole("heading", { name: "Related" }) }).last();
    await expect(related.getByRole("link")).toHaveCount(10);
    await related.getByRole("button", { name: "More" }).click();
    expect(await related.getByRole("link").count()).toBeGreaterThan(10);
    await expect(related.getByRole("button", { name: "Less" })).toBeVisible();
  });

  test("a related topic opens in the app", async ({ page }) => {
    await open(page, "/topics/moses");
    await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
    await side(page).getByRole("link", { name: "Leadership" }).first().click();
    await expect(main(page).getByRole("heading", { level: 1, name: "Leadership" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
  });
});

// @feature TOP-020 @feature TOP-025
test.describe("an author (Rashi)", () => {
  test("Works on Sefaria first, without the funnel or the A; Top Citations; Lived", async ({ page }) => {
    await open(page, "/topics/rashi");
    await expect(page).toHaveURL(/\?sort=Relevance&tab=author-works-on-sefaria$/);
    await expect(tabs(page)).toHaveText(["Works on Sefaria", "Top Citations"]);
    await expect(main(page).getByRole("link", { name: "Rashi on Tanakh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "A", exact: true })).toHaveCount(0);
    await tabs(page).nth(1).click();
    await expect(page.getByRole("button", { name: "Filter and sort" })).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    await expect(side(page).getByRole("heading", { name: "Lived" })).toBeVisible();
    await expect(side(page)).toContainText("1040 – 1105 CE");
  });
});

// @feature TOP-018 @feature TOP-019 @feature TOP-026
test.describe("a Torah portion (Bereshit)", () => {
  test("the dedication, Read the Portion and the Study Companion, and the Readings", async ({ page }) => {
    await open(page, "/topics/parashat-bereshit");
    await expect(main(page)).toContainText("Parashat Bereshit, or Genesis, is dedicated to the Sefaria Pioneers");
    await expect(main(page).getByRole("link", { name: "Read the Portion" })).toHaveAttribute("href", "/Genesis.1.1-6.8");
    const companion = main(page).getByRole("link", { name: "Get the Free Study Companion" });
    await expect(companion).toHaveAttribute("href", "https://learn.sefaria.org/weekly-parashah/");
    await expect(companion).toHaveAttribute("data-anl-promotion_name", "Parashah Email Signup - Parashah Page");
    await expect(side(page).getByRole("heading", { name: "Readings" })).toBeVisible();
    await expect(side(page).getByRole("link", { name: "Genesis 1:1-6:8" })).toBeVisible();
    const aliyot = side(page).locator("a[data-ref]");
    await expect(aliyot).toHaveText(["1", "2", "3", "4", "5", "6", "7", "M"]);
    await expect(aliyot.first()).toHaveAttribute("href", "/Genesis.1.1-2.3");
    await expect(side(page)).toContainText(/of Tishrei|of Cheshvan|of \w+, 57\d\d/);
  });
});

// @feature TOP-027
test.describe("a partner portal (Jonathan Sacks)", () => {
  test("the portal's modules replace the side column, with the sidebar footer", async ({ page }) => {
    await open(page, "/topics/jonathan-sacks");
    await expect(side(page).getByRole("heading", { name: "About the Collection" })).toBeVisible();
    await expect(side(page)).toContainText("Sefaria is proud to collaborate with The Rabbi Sacks Legacy");
    await expect(side(page).getByRole("link", { name: "Help" })).toBeVisible();
    await expect(side(page).getByRole("heading", { name: "Related" })).toHaveCount(0);
  });
});

// @feature TOP-001 @feature TOP-036
test.describe("addresses", () => {
  test("the b test version keeps its address; an unknown topic is not found", async ({ page, request }) => {
    await open(page, "/topics/b/moses");
    await expect(page).toHaveURL(/\/topics\/b\/moses\?sort=Relevance&tab=notable-sources$/);
    await expect(main(page).getByRole("heading", { level: 1, name: "Moses" })).toBeVisible();
    expect((await request.get("/topics/no-such-topic-xyz")).status()).toBe(404);
  });
  test("a topic card on a category page opens the topic in the app", async ({ page }) => {
    await open(page, "/topics/category/biblical-figures");
    await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
    await main(page).locator('a[href="/topics/moses"]').click();
    await expect(main(page).getByRole("heading", { level: 1, name: "Moses" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
  });
});

// @feature TOP-017 @feature I18-013
test.describe("the Hebrew interface", () => {
  test("Hebrew titles and tabs, the source in Hebrew, laid out right to left", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/topics/moses");
    await expect(page).toHaveTitle("משה | מקורות מתוך ספריית ספריא");
    await expect(main(page).getByRole("heading", { level: 1, name: "משה" })).toBeVisible();
    await expect(tabs(page).first()).toHaveText("מקורות מרכזיים");
    await expect(page.getByRole("button", { name: "א", exact: true })).toBeVisible();
    const first = cards(page).first();
    await expect(first.locator('a span[lang="he"]').first()).toHaveAttribute("dir", "rtl");
    // the title at the right, the side column at the left
    const h1 = (await main(page).getByRole("heading", { level: 1 }).boundingBox())!;
    expect(h1.x + h1.width).toBeGreaterThan(1100);
    expect((await side(page).boundingBox())!.x).toBeLessThan(10);
  });
});

// @feature TOP-017 @feature TOP-025
test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("the picture under the description; the side column under the page", async ({ page }) => {
    await open(page, "/topics/moses");
    const img = main(page).getByRole("img", { name: /Moses Strikes the Rock/ });
    await expect(img).toBeVisible();
    const tabsBox = (await page.getByRole("tablist").locator("..").boundingBox())!;
    expect((await img.boundingBox())!.y).toBeLessThan(tabsBox.y);
    expect((await side(page).boundingBox())!.y).toBeGreaterThan(tabsBox.y);
    expect(await tabs(page).first().locator("span").evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
  });
});
