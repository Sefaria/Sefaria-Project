import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// Browse the Library as the site's home (no promo banner since sefaria.org #3934) and the phone header's content-language toggle.
// Pixel parity with sefaria.org itself is checked by scripts/parity-page.mjs and scripts/parity-header-states.mjs (live site).

// @feature LIB-001
test("/ answers 302 → /texts, as sefaria.org does (verified 2026-10-29)", async ({ request, page }) => {
  const r = await request.get("/", { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers()["location"]).toBe("/texts");
  await open(page, "/");
  await expect(page).toHaveURL(/\/texts$/);
  await expect(page.getByRole("heading", { name: "Browse the Library" })).toBeVisible();
});

// @feature PRM-014 @feature AI-001
test("no Ask the Library Assistant banner: sefaria.org removed it (#3934, 2026-11-03)", async ({ page, request }) => {
  await open(page, "/texts");
  await expect(page.getByRole("heading", { name: "Browse the Library" })).toBeVisible(); // presence probe: the page is up
  await expect(page.getByText("Ask the Library Assistant")).toHaveCount(0);
  expect(await (await request.get("/texts")).text()).not.toContain("data-site-banner");
});

// @feature LIB-002 @feature GUI-001
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the content-language toggle is in the site header, not the page, and turns the categories Hebrew", async ({ page }) => {
    await open(page, "/texts");
    const banner = page.getByRole("banner");
    const toggle = banner.getByRole("button", { name: "Hebrew Language Toggle Icon" });
    await expect(toggle).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: "Hebrew Language Toggle Icon" })).toBeHidden();
    await toggle.click();
    await expect(page.locator("main").getByRole("link", { name: 'תנ"ך' }).first()).toBeVisible();
  });
});

// @feature LIB-008 @feature LIB-035
test.describe("category page on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the description sits under the title, as plain text (Markdown not rendered, as on sefaria.org); no About module", async ({ page }) => {
    await open(page, "/texts/Mishnah");
    const main = page.locator("main > div > div:nth-child(2)");
    await expect(main.getByText(/organized into 63 tractates \(\*masekhtot\*\)/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "About Mishnah" })).toBeHidden();
  });
});

// @feature LIB-019
test("a wide screen keeps the category line under the header while the page scrolls", async ({ page }) => {
  await open(page, "/texts/Tanakh");
  const top = async () => page.evaluate(() => [...document.querySelectorAll("main [aria-hidden='true']")].find((e) => (e as HTMLElement).offsetHeight === 4)!.getBoundingClientRect().top);
  const before = await top();
  await page.evaluate(() => (document.getElementById("main")!.scrollTop = 1500));
  await page.waitForTimeout(200);
  expect(await top()).toBe(before);
});

// @feature LIB-002 — parity S12b, measured on sefaria.org in the Hebrew interface (2026-11-10): the descriptions are 17.08px on a 24px line
test("Hebrew interface: the library's and a category's descriptions are the old size", async ({ page }) => {
  await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
  for (const path of ["/texts", "/texts/Tanakh"]) {
    await open(page, path);
    const desc = page.locator('main div[lang="he"][class^="_desc_"]').first();
    await expect(desc).toBeVisible();
    const { size, line } = await desc.evaluate((e) => ({ size: getComputedStyle(e).fontSize, line: getComputedStyle(e).lineHeight }));
    expect({ path, size, line }).toEqual({ path, size: "17.08px", line: "24px" });
  }
});
