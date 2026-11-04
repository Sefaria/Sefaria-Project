import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// The single topic page, as a reader sees it on sefaria.org (surveyed with Playwright 2026-11-04). Data through the API cassette.
const main = (page: Page) => page.getByRole("main");
const side = (page: Page) => page.locator("aside").last();
const tabs = (page: Page) => page.getByRole("tab");
const cards = (page: Page) => page.locator("[data-source-card]");
/** sefaria.org picks the single panel from the User-Agent: the phone tests send a phone's. */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
type Logged = { channel: string; name: string; params?: Record<string, unknown> };
/** The languages of the open source's text, in order (the spans inside the link around the text, not the citation's). */
const bodyLangs = (page: Page) =>
  cards(page).first().evaluate((card) => {
    const span = [...card.querySelectorAll<HTMLElement>('span[lang="he"]')].find((e) => e.textContent!.includes("וְלֹא"));
    return [...(span?.parentElement?.children ?? [])].filter((e) => e.hasAttribute("lang")).map((e) => e.getAttribute("lang"));
  });
const anl = (page: Page) => page.evaluate(() => (window as unknown as { __SEFARIA_ANALYTICS__?: Logged[] }).__SEFARIA_ANALYTICS__ ?? []);
const anlEvents = async (page: Page, name: string) => (await anl(page)).filter((e) => e.channel === "gtag" && e.name === name).map((e) => e.params ?? {});

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
    // every source shown matches the filter, not just the first
    const citations = await cards(page).evaluateAll((els) => els.map((e) => [...e.querySelectorAll("a")].at(-1)?.textContent?.trim() ?? ""));
    expect(citations.length).toBeGreaterThan(1);
    expect(citations.filter((c) => !/^Rashi on /.test(c))).toEqual([]);
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
    // Source alone: no English text left in the open source's body
    await expect(cards(page).first().getByText("Never again did there arise in Israel a prophet like Moses")).toHaveCount(0);
    await expect.poll(() => bodyLangs(page)).toEqual(["he"]);
    await expect(page.locator('[data-anl-batch^="{\\"project\\""]')).toHaveAttribute("data-anl-batch", /"content_lang":"hebrew"/);
    await page.getByRole("button", { name: "A", exact: true }).click();
    await page.getByText("Source with Translation").click();
    await expect.poll(() => bodyLangs(page)).toEqual(["he", "en"]);
    const heText = cards(page).first().locator('span[lang="he"]').filter({ hasText: "וְלֹא" }).first();
    const enText = cards(page).first().locator('span[lang="en"]').filter({ hasText: "Never again did there arise in Israel a prophet like Moses" }).first();
    // the Hebrew above the English
    const [heBox, enBox] = [await heText.boundingBox(), await enText.boundingBox()];
    expect(heBox!.y + heBox!.height).toBeLessThanOrEqual(enBox!.y + 1);
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
    // the groups after Related alphabetical by their singular title: Parent before Parent-in-Law
    expect(heads).toContain("Parents");
    expect(heads).toContain("Parent-in-Law");
    expect(heads.indexOf("Parents")).toBeLessThan(heads.indexOf("Parent-in-Law"));
    const related = side(page).locator("section, div").filter({ has: page.getByRole("heading", { name: "Related" }) }).last();
    const links = related.getByRole("link");
    await expect(links).toHaveCount(10);
    const firstTen = await links.allInnerTexts();
    // sefaria.org's order (verified 2026-11-04)
    expect(firstTen).toEqual(["Leadership", "Parashat Shemot", "Moses' Staff", "Generation of the Desert", "Moses and God", "Pharaoh's Daughter", "Moses and the Torah", "Moses' Prayer", "Moses and his Sons", "Moses's Prophecy"]);
    await related.getByRole("button", { name: "More" }).click();
    await expect(related.getByRole("button", { name: "Less" })).toBeVisible();
    const all = await links.allInnerTexts();
    expect(all.length).toBeGreaterThan(10);
    // More adds to the ten: the first ten stay, in order, and nothing repeats
    expect(all.slice(0, 10)).toEqual(firstTen);
    expect(new Set(all).size).toBe(all.length);
    // every one a routed topic link
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(hrefs.filter((h) => !/^\/topics\/[^/?#]+$/.test(h ?? ""))).toEqual([]);
    await related.getByRole("button", { name: "Less" }).click();
    await expect(links).toHaveCount(10);
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
    await expect(page).toHaveURL(/\?sort=Relevance&tab=popular-writing-of$/);
    await expect(page.getByRole("button", { name: "Filter and sort" })).toBeVisible();
    // Top Citations: Rashi's most cited comments, in the server's order (as sefaria.org shows them, 2026-11-04)
    const cites = await cards(page).evaluateAll((els) => els.slice(0, 4).map((e) => [...e.querySelectorAll("a")].at(-1)?.textContent?.trim()));
    expect(cites).toEqual(["Rashi on Genesis 1:1:2", "Rashi on Genesis 6:9:2", "Rashi on Genesis 6:9:1", "Rashi on Genesis 1:1:1"]);
    await expect(cards(page).first()).toContainText(/IN THE BEGINNING GOD CREATED/);
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
    // the next reading's date and its Hebrew date, as sefaria.org shows them (/api/calendars/next-read, recorded 2026-11-04)
    await expect(side(page)).toContainText("October 30, 2027");
    await expect(side(page)).toContainText("29th of Tishrei, 5788");
    await expect(side(page).getByRole("link", { name: "I Samuel 20:18-42" })).toBeVisible();
  });
});

// @feature TOP-027
test.describe("a partner portal (Jonathan Sacks)", () => {
  test("the portal's modules replace the side column, with the sidebar footer", async ({ page }) => {
    await open(page, "/topics/jonathan-sacks");
    await expect(side(page).getByRole("heading", { name: "About the Collection" })).toBeVisible();
    await expect(side(page)).toContainText("Sefaria is proud to collaborate with The Rabbi Sacks Legacy");
    // the portal's modules in sefaria.org's order: About the Collection, then the sidebar footer with all its links
    const heads = await side(page).getByRole("heading").allInnerTexts();
    expect(heads.filter(Boolean)).toEqual(["About the Collection"]);
    const footer = await side(page).getByRole("link").allInnerTexts();
    expect(footer).toEqual(expect.arrayContaining(["About", "Help", "Contact Us", "Newsletter", "Blog", "Instagram", "Facebook", "YouTube", "Shop", "Terms", "Privacy Policy", "Ways to Give", "Donate"]));
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
  test("an unknown topic: the server's 404 is a 'not found' page, never a reload loop", async ({ page }) => {
    let loads = 0;
    page.on("load", () => loads++);
    const res = await open(page, "/topics/no-such-topic-xyz");
    expect(res!.status()).toBe(404);
    await expect(page.getByText("Page not found.")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(loads).toBe(1);
  });
  test("a 404 reached in the app is loaded again from the server (so Django gets it, with pass-through on)", async ({ page }) => {
    await open(page, "/topics/moses");
    await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
    // a description link the page routes in the app, pointed at a topic this client does not render
    await page.evaluate(() => document.querySelector('a[href$="/topics/yitro"]')!.setAttribute("href", "/topics/no-such-topic-xyz"));
    const reload = page.waitForEvent("load");
    await main(page).locator('a[href="/topics/no-such-topic-xyz"]').first().click();
    await reload;
    await expect(page).toHaveURL(/\/topics\/no-such-topic-xyz$/);
    // a full load: the in-app state is gone, and the server's answer is what shows
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBeUndefined();
    await expect(page.getByText("Page not found.")).toBeVisible();
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
    // typography as sefaria.org.il (measured 2026-11-04): the source text in the Hebrew serif, its small print the browser's
    // "smaller" of 22px, the citation row a serif line; the source body keeps the old left-to-right HACK (26px in, 17px out)
    const text = first.locator('a span[lang="he"]').first();
    expect(await text.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^"Noto Color Emoji", "Taamey Frank"/);
    expect(await text.evaluate((e) => getComputedStyle(e).fontSize)).toBe("22px");
    expect(await text.evaluate((e) => getComputedStyle(e.parentElement!.parentElement!).direction)).toBe("ltr");
    const cite = first.getByRole("link", { name: "דברים ל״ד:י׳-י״ב" });
    expect(await cite.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^Cardo/);
    expect(Math.round((await cite.locator("..").boundingBox())!.height)).toBe(44);
  });
});

// @feature TOP-017 @feature TOP-025
test.describe("on a phone", () => {
  test.use(PHONE);
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

// @feature TOP-017 @feature TOP-023 @feature I18-013
test.describe("the Hebrew interface on a phone", () => {
  test.use(PHONE);
  test("the source wraps in the old 287px column 51px from the left; the A where the old single panel put it", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/topics/moses");
    const text = cards(page).first().locator('a span[lang="he"]').first();
    const box = (await text.boundingBox())!;
    expect(Math.round(box.width)).toBe(287);
    expect(Math.round(box.x)).toBe(51);
    // measured on sefaria.org.il with a phone: the (1.3× scaled) "A" 8.7px under the tab row's top (it was 4px higher before the
    // old single panel's 3px rule was ported)
    const a = page.getByRole("button", { name: "א", exact: true });
    const tabsTop = (await page.getByRole("tablist").locator("..").boundingBox())!.y;
    expect(Math.round((await a.boundingBox())!.y - tabsTop)).toBe(9);
  });
});

// @feature TOP-029 @feature TOP-028 @feature ANL-015
test.describe("the topic page's analytics", () => {
  test("the funnel, the sort, the filter box and the language choice send the old GA4 events with their parameters", async ({ page }) => {
    await open(page, "/topics/moses?sort=Relevance&tab=sources");
    await page.getByRole("button", { name: "Filter and sort" }).locator("img").click();
    await expect.poll(() => anlEvents(page, "filter")).toContainEqual(expect.objectContaining({ text: "Relevance", project: "topics", panel_category: "biblical-figures" }));
    await page.getByRole("button", { name: "Chronological" }).click();
    await expect.poll(() => anlEvents(page, "sort_by")).toContainEqual(expect.objectContaining({ text: "Chronological", from: "Relevance", to: "Chronological" }));
    await main(page).locator('input[name="filterableListInput"]').pressSequentially("ra");
    await expect.poll(async () => (await anlEvents(page, "search")).map((e) => e.text)).toContain("ra");
    await page.getByRole("button", { name: "A", exact: true }).click();
    await expect.poll(() => anlEvents(page, "lang_toggle_click")).toHaveLength(1);
    await page.getByText("Source with Translation").click();
    await expect.poll(() => anlEvents(page, "lang_toggle_select")).toContainEqual(expect.objectContaining({ text: "sourcewtrans", from: "translation", to: "sourcewtrans", feature_name: "source lang toggled" }));
  });

  test("the AI notice's links are in the page from the start, with the old attributes, shown on hover", async ({ page }) => {
    await open(page, "/topics/love");
    const learn = page.locator('[data-anl-event="learn_more_click:click"]');
    const feedback = page.locator('[data-anl-event="feedback_click:click"]');
    await expect(learn).toHaveCount(1);
    await expect(learn).toHaveAttribute("href", "/ai");
    await expect(learn).toHaveAttribute("data-anl-text", "learn_more");
    await expect(feedback).toHaveAttribute("href", "https://sefaria.formstack.com/forms/ai_feedback_form");
    await expect(feedback).toHaveAttribute("data-anl-text", "feedback");
    await expect(learn).toBeHidden();
    await page.locator('img[data-anl-event="ai_marker_hover:mouseover"]').hover();
    await expect(learn).toBeVisible();
    await expect(page.getByText("Some of the text on this page has been AI generated.")).toBeVisible();
  });
});
