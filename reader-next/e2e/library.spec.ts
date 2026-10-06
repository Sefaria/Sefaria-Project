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
