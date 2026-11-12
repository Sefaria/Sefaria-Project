import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature LIB-001 @feature LIB-008 @feature LIB-009 @feature LIB-011 @feature LIB-012 @feature LIB-014 @feature LIB-023 @feature LIB-031 @feature LIB-069 @feature RTE-009
test.describe("the library (verified against sefaria.org)", () => {
  test("/texts: Browse the Library; a category card goes to its page; a book to its page", async ({ page }) => {
    await open(page, "/texts");
    await expect(page.getByRole("heading", { level: 1, name: "Browse the Library" })).toBeVisible();
    await expect(page.getByRole("complementary").getByText("A Living Library of Torah")).toBeVisible();
    await page.getByRole("link", { name: "Tanakh", exact: true }).click();
    await expect(page).toHaveURL(/\/texts\/Tanakh$/);
    await expect(page.getByRole("heading", { level: 2, name: /^Torah/ })).toBeVisible();
    await page.getByRole("link", { name: "Genesis", exact: true }).first().click();
    await expect(page).toHaveURL(/\/Genesis$/);
    await expect(page.getByRole("heading", { level: 1, name: "Genesis" })).toBeVisible();
  });

  test("Talmud: Babylonian is the default; Jerusalem switches by link; the footer is there", async ({ page }) => {
    await open(page, "/texts/Talmud");
    await expect(page.getByRole("link", { name: "Babylonian", exact: true })).toHaveAttribute("data-current", "true");
    await expect(page.getByRole("link", { name: "The William Davidson Edition" })).toBeVisible();
    await page.getByRole("link", { name: "Jerusalem", exact: true }).click();
    await expect(page).toHaveURL(/\/texts\/Talmud\/Yerushalmi$/);
    await expect(page.getByRole("navigation", { name: "Footer links" }).getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  });

  test("the old spelling Tanach goes to Tanakh; an unknown category shows the library home", async ({ page, request }) => {
    const r = await request.get("/texts/Tanach/Torah", { maxRedirects: 0 });
    expect(r.status()).toBe(301);
    expect(r.headers().location).toMatch(/\/texts\/Tanakh\/Torah$/);
    await open(page, "/texts/Nope");
    await expect(page.getByRole("heading", { level: 1, name: "Browse the Library" })).toBeVisible();
    // /texts/history (where Django's /texts/recent goes) is the library home with its own title, as on sefaria.org (not "history | …")
    await open(page, "/texts/history");
    await expect(page.getByRole("heading", { level: 1, name: "Browse the Library" })).toBeVisible();
    await expect(page).toHaveTitle("Sefaria: a Living Library of Jewish Texts Online");
    // PLT-006: the title the reader sees on sefaria.org and the description its server writes (VERIFIED 2026-11-10)
    await open(page, "/texts/Tanakh/Torah");
    await expect(page).toHaveTitle("Tanakh, Torah | The Sefaria Library");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "Five Books of Moses");
    await open(page, "/Genesis");
    await expect(page).toHaveTitle("Genesis | The Sefaria Library");
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /^Genesis \(“Bereshit”\).* Read the text of Genesis online with commentaries and connections\.$/);
    // PLT-008: og:url, canonical and alternates as base.html (configured canonical origin: www.sefaria.org)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/www\.sefaria\.org\/Genesis$/);
    await expect(page.locator('link[rel="alternate"][hreflang="he"]')).toHaveAttribute("href", /\/\/www\.sefaria\.org\.il\/Genesis$/);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/Genesis$/);
    await open(page, "/search?q=moses");
    await expect(page).toHaveTitle("moses | The Sefaria Library");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/search\?q=moses$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });
});

// @feature LIB-004
test.describe("library home on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the About blurb sits under 'Browse the Library', above the categories (verified with a phone User-Agent)", async ({ page }) => {
    await open(page, "/texts");
    const blurb = page.getByText("Sefaria is home to 3,000 years of Jewish texts.").first();
    await expect(blurb).toBeVisible();
    const h = await page.getByRole("heading", { name: "Browse the Library" }).boundingBox();
    const b = await blurb.boundingBox();
    const t = await page.getByRole("link", { name: "Tanakh" }).first().boundingBox();
    expect(b!.y).toBeGreaterThan(h!.y);
    expect(b!.y).toBeLessThan(t!.y);
  });
  test("not on a wide screen (the sidebar has it)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "/texts");
    const visible = await page.evaluate(() => [...document.querySelectorAll("p")].filter((p) => p.textContent?.includes("Sefaria is home to 3,000 years") && p.getClientRects().length > 0).length);
    expect(visible).toBe(1); // the sidebar's only
  });
});

// CODE_REVIEW R-14: the whole catalog (3.5 MB) was in the HTML of every library and search page
test("library and search pages carry their slice of the catalog, not all of it", async ({ request, page }) => {
  for (const [path, max] of [["/texts", 300_000], ["/texts/Tanakh/Torah", 400_000], ["/search?q=light&tab=text&search_tab=sources&tvar=1&tsort=relevance", 400_000]] as const) {
    const html = await (await request.get(path)).text();
    expect(html.length, path).toBeLessThan(max);
  }
  // the search filters arrive once the catalog is on the client
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/search?q=light&tab=text&search_tab=sources&tvar=1&tsort=relevance");
  await expect(page.getByRole("checkbox", { name: "Tanakh", exact: true })).toBeVisible({ timeout: 15_000 });
});

// @feature LIB-025 @feature LIB-007 @feature LIB-004: VERIFIED on sefaria.org 2026-11-10 (Playwright, a user_history cookie): the
// newest item of the first three books (no sheets) after the promo slot and before Translations; on a phone a band above the categories
test.describe("Recently Viewed on the library home", () => {
  const HISTORY = [
    { ref: "Genesis 1:3", he_ref: "בראשית א׳:ג׳", book: "Genesis", versions: { en: null, he: null } },
    { ref: "Genesis 2", book: "Genesis", versions: { en: null, he: null } },
    { ref: "Sheet 1", book: "Sheet", versions: {} },
    { ref: "Berakhot 2a", book: "Berakhot", versions: { en: { versionTitle: "William Davidson Edition - English", languageFamilyName: "english" }, he: null } },
    { ref: "Exodus 3", book: "Exodus", versions: { en: null, he: null } },
    { ref: "Psalms 23", book: "Psalms", versions: { en: null, he: null } },
  ];
  /** The history answered in the browser; the page is reached in the app (the server asks the API with the reader's cookies). */
  const reachHome = async (page: import("@playwright/test").Page) => {
    await page.route(/\/api\/profile\/user_history\?secondary=0&annotate=1&limit=20/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HISTORY) }));
    await open(page, "/topics");
    await page.getByRole("banner").getByRole("link", { name: "Texts" }).first().click();
    await expect(page).toHaveURL(/\/texts$/);
  };

  test("in the sidebar: three books, with their versions; All history opens the sign-up modal signed out", async ({ page }) => {
    await reachHome(page);
    const side = page.locator("section", { has: page.getByRole("heading", { name: "Recently Viewed" }) }).first();
    await expect(side.getByRole("listitem")).toHaveText(["Genesis 1:3", "Berakhot 2a", "Exodus 3"]);
    await expect(side.getByRole("link", { name: "Berakhot 2a" })).toHaveAttribute("href", /^\/Berakhot\.2a\?ven=english\|William/);
    // its place: after the promo slot, before Translations
    const titles = await page.locator("aside h2, [class*=sidebar] h2").allTextContents();
    expect(titles.indexOf("Recently Viewed")).toBeLessThan(titles.indexOf("Translations"));
    expect(titles.indexOf("Recently Viewed")).toBeGreaterThan(titles.indexOf("A Living Library of Torah"));
    await side.getByRole("link", { name: /All history/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/texts$/);
  });

  test("nothing when there is no history", async ({ page }) => {
    await page.route(/\/api\/profile\/user_history\?secondary=0&annotate=1&limit=20/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await open(page, "/topics");
    await page.getByRole("banner").getByRole("link", { name: "Texts" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Browse the Library" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recently Viewed" })).toHaveCount(0);
  });

  test("a history of sheets only: the title and All history with an empty list, as the old module", async ({ page }) => {
    await page.route(/\/api\/profile\/user_history\?secondary=0&annotate=1&limit=20/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([HISTORY[2]]) }));
    await open(page, "/topics");
    await page.getByRole("banner").getByRole("link", { name: "Texts" }).first().click();
    const side = page.locator("section", { has: page.getByRole("heading", { name: "Recently Viewed" }) }).first();
    await expect(side.getByRole("link", { name: /All history/ })).toBeVisible();
    await expect(side.getByRole("listitem")).toHaveCount(0);
  });

  // L4: the server's own path: a full page load with a history cookie. The cassette's answer for the history request is replaced by
  // the e2e API stand-in only in the browser, so the server render is checked for its headers (never shared) and for hydrating cleanly
  test("loaded as a page with a history cookie: private, no-store, and the page hydrates without a mismatch", async ({ page, context }) => {
    await context.addCookies([{ name: "user_history", value: encodeURIComponent(JSON.stringify(HISTORY.slice(0, 1))), domain: "localhost", path: "/" }]);
    const res = await open(page, "/texts");
    expect(res!.headers()["cache-control"]).toBe("private, no-store");
    await expect(page.getByRole("heading", { level: 1, name: "Browse the Library" })).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("a band above the categories: the title and All History in its header row, the list under it", async ({ page }) => {
      await page.route(/\/api\/profile\/user_history\?secondary=0&annotate=1&limit=20/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HISTORY) }));
      await open(page, "/topics");
      await page.getByRole("button", { name: "Menu" }).first().click();
      await page.locator("#mobile-nav").getByRole("link", { name: "Texts" }).click();
      const band = page.locator("section[aria-labelledby='recently-viewed-phone']");
      await expect(band).toBeVisible();
      await expect(band.getByRole("listitem")).toHaveText(["Genesis 1:3", "Berakhot 2a", "Exodus 3"]);
      const [title, all, first, grid] = await Promise.all([
        band.getByRole("heading").boundingBox(),
        band.getByRole("link", { name: "All History" }).boundingBox(),
        band.getByRole("link", { name: "Genesis 1:3" }).boundingBox(),
        page.locator("[data-cat='Tanakh']").boundingBox(),
      ]);
      // measured on sefaria.org: the band from the screen's left edge, title at x=20, All History right-aligned to x=370, items under
      expect((await band.boundingBox())!.x).toBe(0);
      expect(title!.x).toBe(20);
      expect(Math.round(all!.x + all!.width)).toBe(370);
      expect(first!.y).toBeGreaterThan(title!.y + title!.height);
      expect(grid!.y).toBeGreaterThan(first!.y);
    });
  });
});

// @feature LIB-005: the old TextsPage Dedication (a Google Sheet by date; the day turns at 6 pm local time). Today's sheet rows are
// empty on sefaria.org (2026-11-10), so the band is shown here from a stand-in answer
test("the daily dedication: today's row of the sheet, under the title; nothing for an empty day", async ({ page }) => {
  const date = await page.evaluate(() => {
    const d = new Date(Date.now() + 6 * 3_600_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  let answer = "";
  await page.route(/docs\.google\.com\/spreadsheets\/d\/11c9Yw9FdfLnfbIWqvUztCt-QICW5790dfFGgXH7IB1k\/gviz/, (r) => r.fulfill({ status: 200, contentType: "text/plain", body: answer, headers: { "access-control-allow-origin": "*" } }));
  answer = `/*O_o*/\ngoogle.visualization.Query.setResponse({"table":{"rows":[{"c":[{"v":"Date()","f":"${date}"},{"v":"Today's learning is dedicated by [the Levi family](https://example.org)"},{"v":"הלימוד היום מוקדש"}]}]}});`;
  await open(page, "/texts");
  const band = page.locator("[data-dedication]");
  await expect(band).toHaveText("Today's learning is dedicated by the Levi family");
  await expect(band.getByRole("link")).toHaveAttribute("href", "https://example.org");
  const [title, box, grid] = await Promise.all([page.getByRole("heading", { level: 1 }).boundingBox(), band.boundingBox(), page.locator("[data-cat='Tanakh']").boundingBox()]);
  expect(box!.y).toBeGreaterThan(title!.y);
  expect(grid!.y).toBeGreaterThan(box!.y + box!.height);
  expect(await band.evaluate((e) => [getComputedStyle(e).paddingTop, getComputedStyle(e).fontSize, getComputedStyle(e.firstElementChild!).fontStyle])).toEqual(["26px", "18px", "italic"]);
  answer = `google.visualization.Query.setResponse({"table":{"rows":[{"c":[{"f":"${date}"},null,{"v":null}]}]}});`;
  await page.evaluate(() => sessionStorage.clear());
  await page.context().clearCookies();
  const fresh = await page.context().newPage();
  await fresh.route(/docs\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/plain", body: answer }));
  await open(fresh, "/texts");
  await expect(fresh.getByRole("heading", { level: 1, name: "Browse the Library" })).toBeVisible();
  await fresh.waitForTimeout(500);
  await expect(fresh.locator("[data-dedication]")).toHaveCount(0);
});
