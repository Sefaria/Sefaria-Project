import { expect, test } from "@playwright/test";
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
  await expect(side.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
});

// @feature LIB-020
test("the list is in the server's page (no request after load), and a sub-category closes and opens", async ({ page, request }) => {
  const html = await (await request.get("/translations/de")).text();
  expect(html).toContain("Deuteronomy");
  expect(html).not.toContain('"catalog","toc"'); // the catalog itself stays out of the page
  await open(page, "/translations/de");
  const prophets = page.locator("details", { has: page.locator("summary", { hasText: "Prophets" }) });
  await expect(prophets.getByRole("link", { name: "Joshua" })).toBeVisible();
  await prophets.locator("summary").click();
  await expect(prophets.getByRole("link", { name: "Joshua" })).toBeHidden();
  await prophets.locator("summary").click();
  await expect(prophets.getByRole("link", { name: "Joshua" })).toBeVisible();
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
test("a text's link opens the reader in that translation, in the app", async ({ page }) => {
  await open(page, "/translations/de");
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await page.getByRole("link", { name: "Genesis", exact: true }).click();
  await expect(page).toHaveURL(/\/Genesis\.1\?/);
  await expect(page.getByText("Die fünf Bücher Moses", { exact: false }).first()).toBeVisible();
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
});

// @feature LIB-021
test("Hebrew: the list API fails on sefaria.org; the page still shows its title and an empty tab", async ({ page }) => {
  test.setTimeout(90_000);
  await page.route("**/api/texts/translations/he", (r) => r.fulfill({ status: 500, body: "Internal Server Error" }));
  await open(page, "/translations/he");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ספריה בעברית");
  await expect(page.getByRole("tab", { name: "Texts" })).toBeVisible();
  await expect(page.getByRole("tabpanel").locator("h2")).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("heading", { name: "A Living Library of Torah" })).toBeVisible();
});

// @feature LIB-020 @feature I18-013
test.describe("Hebrew interface", () => {
  test.beforeEach(async ({ context }) => context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]));
  test("right to left, Hebrew names; the page's own title and About stay in German", async ({ page }) => {
    await open(page, "/translations/de");
    const main = page.locator("#main");
    await expect(main.locator("[dir=rtl]").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jüdische Texte in Deutscher Sprache");
    await expect(page.getByRole("tab", { name: "מקורות" })).toBeVisible();
    await expect(page.getByRole("tabpanel").getByRole("heading", { level: 2 }).first()).toHaveText('תנ"ך');
    await expect(page.getByRole("link", { name: "בראשית", exact: true })).toBeVisible();
    // the first text sits at the right of its row
    const row = page.locator("[role=tabpanel] ul").first().boundingBox();
    const first = page.getByRole("link", { name: "בראשית", exact: true }).boundingBox();
    const [r, f] = await Promise.all([row, first]);
    expect(f!.x + f!.width).toBeGreaterThan(r!.x + r!.width - 5);
    await expect(page.getByRole("complementary").getByRole("heading", { name: "Eine lebendige Bibliothek der Tora" })).toBeVisible();
  });
});

// @feature LIB-020 @mobile
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the site header stays, one column, the sidebar under the list @mobile", async ({ page }) => {
    await open(page, "/translations/de");
    await expect(page.getByRole("banner")).toBeVisible();
    const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(h1!.x).toBeLessThan(20);
    const about = await page.getByRole("complementary").getByRole("heading", { name: "Eine lebendige Bibliothek der Tora" }).boundingBox();
    const last = await page.getByRole("tabpanel").locator("li").last().boundingBox();
    expect(about!.y).toBeGreaterThan(last!.y);
    await expect(page.getByRole("tab", { name: "Texts" }).locator("div")).toHaveCSS("font-size", "16px");
  });
});
