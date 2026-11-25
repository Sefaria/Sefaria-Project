import { expect, test, type Locator } from "@playwright/test";
import { open, setScrollTop } from "./helpers";

/*
 * The reader's text against sefaria.org (2026-11-18, Playwright, Genesis 1 and Rashi on Genesis 1:1, 375x812 and 1280x900):
 * the source text, the verse numbers, the section title and the parashah are black (#000; the Hebrew side was #121212 here); a
 * citation inside the text #333; the book's title above its first section 30px black (36.6px in Hebrew, .bookMetaDataBox .title);
 * a Hebrew parashah 29.28px (122% of 24px); on a phone the translation suggestion's lines centred, its button regular weight.
 */
const css = (l: Locator, p: string) => l.evaluate((e, prop) => getComputedStyle(e).getPropertyValue(prop), p);

test("the source, its numbers and its titles are black; the book's title above the first section is 30px", async ({ page }) => {
  await open(page, "/Genesis.1?lang=bi");
  const seg = page.locator('[role="group"][data-ref="Genesis 1:1"]').first();
  await expect(seg).toBeVisible();
  expect(await css(seg.locator('[data-side="primary"]').first(), "color")).toBe("rgb(0, 0, 0)");
  expect(await css(seg.locator("[data-number]").first(), "color")).toBe("rgb(0, 0, 0)");
  expect(await css(page.locator("[data-section-title] h2").first(), "color")).toBe("rgb(0, 0, 0)");
  await setScrollTop(page, 0);
  const book = page.locator("p", { hasText: /^Genesis$/ }).first();
  await expect(book).toBeVisible();
  expect(await css(book, "font-size")).toBe("30px");
  expect(await css(book, "color")).toBe("rgb(0, 0, 0)");
});

test("in Hebrew the parashah is 29.28px and the book's title 36.6px", async ({ page }) => {
  await open(page, "/Genesis.1?lang=he");
  const parashah = page.locator('h3[lang="he"]').first();
  await expect(parashah).toBeVisible();
  expect(await css(parashah, "font-size")).toBe("29.28px");
  await setScrollTop(page, 0);
  const book = page.locator('p[lang="he"]', { hasText: /^בראשית$/ }).first();
  await expect(book).toBeVisible();
  expect(await css(book, "font-size")).toBe("36.6px");
});

test("a citation inside the text is #333", async ({ page }) => {
  await open(page, "/Rashi_on_Genesis.1.1?lang=bi");
  const cite = page.locator("[role=group] a.ref-link").first();
  await expect(cite).toBeVisible();
  expect(await css(cite, "color")).toBe("rgb(51, 51, 51)");
});

// @feature SHL-061
test("on a phone the translation suggestion's message is centred and its button regular weight @mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
  await open(page, "/Genesis.1?lang=bi");
  const banner = page.getByRole("region", { name: "Suggestion" });
  await expect(banner).toBeVisible();
  expect(await css(banner.locator("p").first(), "text-align")).toBe("center");
  expect(await css(banner.getByRole("button", { name: "Go to translations" }), "font-weight")).toBe("400");
});
