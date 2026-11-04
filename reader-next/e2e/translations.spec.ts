import { devices, expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// /translations/<lang>: the texts available in one translation language (the old TranslationsPage). Data from the API cassette
// (sefaria.org). Pixel parity with the live site: scripts/parity-page.mjs (docs/features/CHANGELOG.md, 2026-11-04 — translations).

const SLUGS: Record<string, string> = {
  ar: "نصوص يهودية بالعربية", de: "Jüdische Texte in Deutscher Sprache", en: "Jewish Texts in English", eo: "Judaj Tekstoj en Esperanto",
  es: "Textos Judíos en Español", fa: "متون یهودی به زبان فارسی", fi: "Juutalaiset tekstit suomeksi", fr: "Textes juifs en français",
  he: "ספריה בעברית", it: "Testi ebraici in italiano", pl: "Teksty żydowskie w języku polskim", pt: "Textos judaicos em portugues",
  ru: "Еврейские тексты на русском языке", yi: "יידישע טעקסטן אויף יידיש",
};

// @feature LIB-020 @feature LIB-029 @feature RTE-011
test("German: the German title, one Texts tab, corpora with their open sub-categories, links straight into the translation", async ({ page }) => {
  await open(page, "/translations/de");
  await expect(page).toHaveTitle("Jüdische Texte in Deutscher Sprache");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jüdische Texte in Deutscher Sprache");
  await expect(page.getByRole("tab", { name: "Texts" })).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(["Tanakh", "Mishnah", "Talmud", "Midrash", "Halakhah", "Jewish Thought"]);
  const torah = panel.locator("details", { has: page.locator("summary", { hasText: "Torah" }) }).first();
  await expect(torah).toHaveAttribute("open", "");
  await expect(torah.locator("summary")).toHaveCSS("text-transform", "uppercase");
  await expect(torah.getByRole("link")).toHaveText(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]);
  // the address exactly as sefaria.org's server writes it
  await expect(torah.getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/Genesis.1?ven=german%7CDie+f%C3%BCnf+B%C3%BCcher+Moses%2C+trans.+Dr.+J.+Wohlgemuth%2C+R%C3%B6delheim+1899+%5Bde%5D&lang=bi");
  // Kitzur Shulchan Arukh sits at Halakhah's top, before its sub-categories
  const halakhah = panel.locator("[data-corpus='Halakhah']");
  await expect(halakhah.locator(":scope > ul").getByRole("link")).toHaveText(["Kitzur Shulchan Arukh"]);
  // the sidebar's About module is in German
  const side = page.getByRole("complementary");
  await expect(side.getByRole("heading", { name: "Eine lebendige Bibliothek der Tora" })).toBeVisible();
  await expect(side.getByText(/^Sefaria ist eine Bibliothek für jüdische Texte aus 3\.000 Jahren/)).toBeVisible();
  // this page's sidebar: the About module only (not the library's modules, such as its language list)
  await expect(side.getByRole("heading")).toHaveText(["Eine lebendige Bibliothek der Tora"]);
  await expect(side.getByRole("link", { name: "Deutsch" })).toHaveCount(0);
});

// @feature LIB-020 @feature LIB-021
test("the list is in the server's page as links (no request for it after load), and a sub-category closes and opens", async ({ page, request }) => {
  const html = await (await request.get("/translations/de")).text();
  // rendered, not only in the page's data: the tab panel's list, with a text's link and name
  expect(html).toMatch(/data-translations-list="ready"/);
  expect(html).toMatch(/<li[^>]*><a[^>]*href="\/Deuteronomy\.1\?ven=german%7C[^"]+"[^>]*>(?:<[^>]+>)*Deuteronomy</);
  // the catalog (3.5 MB) and the terms stay on the server: the whole page is small, and a catalog-only title is not in it
  expect(html.length).toBeLessThan(400_000);
  expect(html).not.toContain("Shulchan Arukh, Orach Chayim");
  const asked: string[] = [];
  page.on("request", (r) => /_serverFn|\/api\/texts\/translations/.test(r.url()) && asked.push(r.url()));
  await open(page, "/translations/de");
  const prophets = page.locator("details", { has: page.locator("summary", { hasText: "Prophets" }) });
  await expect(prophets.getByRole("link", { name: "Joshua" })).toBeVisible();
  await prophets.locator("summary").click();
  await expect(prophets.getByRole("link", { name: "Joshua" })).toBeHidden();
  await prophets.locator("summary").click();
  await expect(prophets.getByRole("link", { name: "Joshua" })).toBeVisible();
  expect(asked).toEqual([]);
});

// @feature LIB-020 @feature LIB-029
test("English: every block starts closed; commentaries are bundled under their category page; the library's own About", async ({ page }) => {
  await open(page, "/translations/en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jewish Texts in English");
  const details = page.locator("[role=tabpanel] details");
  await expect(details.first()).toBeVisible();
  expect(await details.evaluateAll((ds) => ds.filter((d) => (d as HTMLDetailsElement).open).length)).toBe(0);
  const rishonim = page.locator("details", { has: page.locator("summary", { hasText: "Rishonim on Tanakh" }) }).first();
  await expect(rishonim.getByRole("link", { name: "Rashi", exact: true })).toBeHidden();
  await rishonim.locator("summary").click();
  await expect(rishonim.getByRole("link", { name: "Rashi", exact: true })).toHaveAttribute("href", "/texts/Tanakh/Rishonim on Tanakh/Rashi");
  await expect(page.getByRole("complementary").getByRole("heading", { name: "A Living Library of Torah" })).toBeVisible();
});

// @feature LIB-070 @feature LIB-020 @feature RTE-056
test("a text's link opens the reader in that translation, in the app, at the address sefaria.org writes", async ({ page }) => {
  await open(page, "/translations/de");
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  const torah = page.locator("details", { has: page.locator("summary", { hasText: "Torah" }) }).first();
  await torah.getByRole("link", { name: "Exodus", exact: true }).click();
  // sefaria.org, 2026-11-04: /Exodus.1?ven=german|Die_Heilige_Schrift,_trans._Dr._Simon_Bernfeld,_Berlin,_1902_-_German_[de]&lang=bi&aliyot=0
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(
    "/Exodus.1?ven=german|Die_Heilige_Schrift,_trans._Dr._Simon_Bernfeld,_Berlin,_1902_-_German_[de]&lang=bi&aliyot=0",
  );
  // the reader shows Exodus 1 in that German translation, beside the Hebrew
  const first = page.locator('[role="group"][data-ref="Exodus 1:1"]');
  await expect(first).toBeVisible();
  await expect(first.locator('[lang="de"]')).toContainText(/^Dies sind die Namen der Söhne Israels/);
  await expect(first.locator('[lang="he"]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

// @feature LIB-037 @feature RTE-011
test("the library sidebar's language list opens these pages in the app", async ({ page }) => {
  await open(page, "/texts");
  const link = page.getByRole("complementary").getByRole("link", { name: "Deutsch" });
  await expect(link).toHaveAttribute("href", "/translations/de");
  await link.click();
  await expect(page).toHaveURL(/\/translations\/de$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jüdische Texte in Deutscher Sprache");
  await expect(page.getByRole("tabpanel").getByRole("heading", { level: 2 }).first()).toHaveText("Tanakh");
});

// @feature LIB-037 @feature RTE-011 @feature LIB-020
test("Türkçe and Română, which Django has no page for, open a page inside the app as on sefaria.org; loaded directly they are a 404", async ({ page, request }) => {
  await open(page, "/texts");
  const side = page.getByRole("complementary");
  await side.getByRole("link", { name: "Türkçe" }).click();
  await expect(page).toHaveURL(/\/translations\/tr$/);
  await expect(page).toHaveTitle("Türkçe Yahudi Metinleri");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Türkçe Yahudi Metinleri");
  // sefaria.org, 2026-11-04: Kabbalah, Jewish Thought, Musar
  await expect(page.getByRole("tabpanel").getByRole("heading", { level: 2 })).toHaveText(["Kabbalah", "Jewish Thought", "Musar"]);
  await expect(page.getByRole("tabpanel").getByRole("link").first()).toHaveAttribute("href", /%5Btr%5D&lang=bi$/);
  await expect(page.getByRole("complementary").getByRole("heading", { name: "A Living Library of Torah" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/texts$/);
  await page.getByRole("complementary").getByRole("link", { name: "Română" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Texte evreiești în limba română");
  for (const slug of ["tr", "ro"]) expect((await request.get(`/translations/${slug}`)).status(), slug).toBe(404);
});

// @feature LIB-021 @feature RTE-011
test("every language Django accepts has its page, its title and its description; any other slug is a 404", async ({ request }) => {
  for (const [slug, title] of Object.entries(SLUGS)) {
    if (slug === "he") continue; // its list API answers 500 after ~16s on sefaria.org: its own test below
    const r = await request.get(`/translations/${slug}`);
    expect(r.status(), slug).toBe(200);
    const html = await r.text();
    expect(html, slug).toContain(`<title>${title}</title>`);
    expect(html, slug).toMatch(/<meta name="description" content="[^"]{40,}"/);
  }
  for (const slug of ["ro", "tr", "lad", "xx", "DE"]) expect((await request.get(`/translations/${slug}`)).status(), slug).toBe(404);
  // (a trailing slash, /translations/de/, is Django's in the cluster — its 404 — not our redirect: src/server/pass-through.test.ts)
});

// @feature LIB-021
test("Hebrew: the list API fails on sefaria.org (500 after ~16s); the page does not wait for it, shows its title and an empty tab", async ({ page, request }) => {
  test.setTimeout(90_000);
  // a language whose list answers renders its list (so an empty list below is the failure, not a broken page)
  await open(page, "/translations/fr");
  await expect(page.getByRole("tabpanel").getByRole("heading", { level: 2 }).first()).toHaveText("Tanakh");
  // sefaria.org answers /translations/he in ~1.1s; the server's page does not wait for the failing API (it waited 7s)
  const t0 = Date.now();
  const r = await request.get("/translations/he");
  expect(r.status()).toBe(200);
  expect(Date.now() - t0).toBeLessThan(5_000);
  expect(await r.text()).toContain('data-translations-list="empty"');
  await open(page, "/translations/he");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ספריה בעברית");
  await expect(page.getByRole("tab", { name: "Texts" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveAttribute("data-translations-list", "empty");
  await expect(page.getByRole("tabpanel").locator("h2")).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("heading", { name: "A Living Library of Torah" })).toBeVisible();
});

// @feature LIB-020
test("analytics: the page carries the old reader panel's data-anl-batch", async ({ page, context }) => {
  await open(page, "/translations/de");
  const batch = page.locator("[data-anl-batch]").filter({ has: page.getByRole("heading", { level: 1 }) });
  await expect(batch).toHaveCount(1);
  expect(JSON.parse((await batch.getAttribute("data-anl-batch"))!)).toEqual({ panel_number: 1, content_lang: "english" });
  await context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
  await open(page, "/translations/de");
  expect(JSON.parse((await page.locator("[data-anl-batch]").filter({ has: page.getByRole("heading", { level: 1 }) }).getAttribute("data-anl-batch"))!)).toEqual({ panel_number: 1, content_lang: "hebrew" });
});

// @feature LIB-020 @feature I18-013
test.describe("Hebrew interface", () => {
  test.beforeEach(async ({ context }) => context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]));
  test("right to left, Hebrew names (the terms first: Exodus is ספר שמות); the page's own title and About stay in German", async ({ page }) => {
    await open(page, "/translations/de");
    const panel = page.getByRole("tabpanel");
    expect(await panel.evaluate((e) => getComputedStyle(e).direction)).toBe("rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jüdische Texte in Deutscher Sprache");
    await expect(page.getByRole("heading", { level: 1 }).locator("[lang=de]")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("tab", { name: "מקורות" })).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(['תנ"ך', "משנה", "תלמוד", "מדרש", "הלכה", "מחשבת ישראל"]);
    const torah = panel.locator("details").first();
    await expect(torah.locator("summary")).toHaveText("תורה");
    // as sefaria.org's Hebrew interface (2026-11-04): the terms dictionary's names, not the index titles (שמות, ויקרא, יונה)
    await expect(torah.getByRole("link")).toHaveText(["בראשית", "ספר שמות", "ספר ויקרא", "במדבר", "ספר דברים"]);
    await expect(panel.locator("details", { has: page.locator("summary", { hasText: "נביאים" }) }).getByRole("link", { name: "יונה הנביא", exact: true })).toBeVisible();
    // the first text sits at the right of its row
    const row = await torah.locator("ul").boundingBox();
    const first = await torah.getByRole("link", { name: "בראשית", exact: true }).boundingBox();
    expect(first!.x + first!.width).toBeGreaterThan(row!.x + row!.width - 5);
    await expect(page.getByRole("complementary").getByRole("heading", { name: "Eine lebendige Bibliothek der Tora" })).toBeVisible();
  });
});

// @feature LIB-020 @mobile
test.describe("phone", () => {
  // a phone's User-Agent too (sefaria.org picks its single-panel layout from it), in either project
  const { defaultBrowserType: _browser, ...pixel } = devices["Pixel 7"];
  test.use(pixel);
  test("the site header stays, one column with a 16px gutter, the sidebar under the list, no sideways scroll @mobile", async ({ page }) => {
    await open(page, "/translations/de");
    await expect(page.getByRole("banner")).toBeVisible();
    const vw = page.viewportSize()!.width;
    const h1 = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const list = (await page.getByRole("tabpanel").boundingBox())!;
    expect(Math.round(h1.x)).toBeGreaterThanOrEqual(12);
    expect(Math.round(h1.x)).toBeLessThanOrEqual(20);
    expect(list.width).toBeGreaterThan(vw - 50);
    const about = (await page.getByRole("complementary").getByRole("heading", { name: "Eine lebendige Bibliothek der Tora" }).boundingBox())!;
    const last = (await page.getByRole("tabpanel").locator("li").last().boundingBox())!;
    expect(about.y).toBeGreaterThan(last.y);
    expect(Math.abs(about.x - h1.x)).toBeLessThan(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("tab", { name: "Texts" }).locator("div")).toHaveCSS("font-size", "16px");
  });
});
