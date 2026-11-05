import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// Browse the Library as the site's home, its promo banner and the phone header's content-language toggle.
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
test("signed out, a wide screen shows Ask the Library Assistant; Maybe later puts it away", async ({ page }) => {
  await open(page, "/texts");
  const banner = page.locator("[data-site-banner]");
  await expect(banner.getByText("Ask the Library Assistant")).toBeVisible();
  await expect(banner.getByRole("link", { name: "Log in to Try" })).toHaveAttribute("href", "/login?next=%2Fenable-library-assistant%3Fnext%3D%252Ftexts");
  await banner.getByRole("button", { name: "Maybe later" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await page.waitForSelector("html[data-hydrated='true']");
  await expect(page.locator("[data-site-banner]")).toHaveCount(0);
});

test("the banner is in the server's page, so it never pushes the page down once it is up", async ({ request }) => {
  const html = await (await request.get("/texts")).text();
  expect(html).toContain("data-site-banner");
  expect(html).toContain("promo_backoff_signup_promo_banner_dismissed_state"); // the pre-paint back-off script
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
