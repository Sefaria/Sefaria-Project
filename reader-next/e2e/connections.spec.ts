import { expect, test } from "@playwright/test";
import { open, wheel } from "./helpers";

const panel = (page: import("@playwright/test").Page) => page.getByRole("complementary");

// @feature CON-012 @feature CON-019 @feature CON-023 @feature SHL-046 @feature CON-008 @feature RTE-062
test.describe("connections sidebar", () => {
  test("selecting a verse opens Resources with its connection categories", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.locator('[role="group"][data-ref="Genesis 1:1"]').click();
    await expect(page).toHaveURL(/\/Genesis\.1\.1\?.*with=all/);
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole("heading", { name: "Related Texts" })).toBeVisible();
    // Commentary leads, and the verse is highlighted (the blue hue shows while the sidebar is open).
    await expect(panel(page).getByRole("region", { name: "Related Texts" }).getByRole("link").first()).toContainText("Commentary");
    await expect(page.locator('[data-focused="true"]')).toHaveAttribute("data-ref", "Genesis 1:1");
    const bg = await page.locator('[data-ref="Genesis 1:1"][role="group"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("the first four categories show, with More to expand", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=all&lang=en");
    const rows = panel(page).locator("a[href*='ConnectionsList']");
    await expect(rows).toHaveCount(4);
    await panel(page).getByRole("button", { name: "More" }).click();
    expect(await rows.count()).toBeGreaterThan(4);
    await panel(page).getByRole("button", { name: "See Less" }).click();
    await expect(rows).toHaveCount(4);
  });

  test("drill into a category, then a commentator, then back", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=all&lang=en");
    await panel(page).getByRole("link", { name: /^Commentary/ }).click();
    await expect(page).toHaveURL(/with=Commentary(\+|%20)ConnectionsList/);
    await expect(panel(page).getByRole("link", { name: /All Commentary/ })).toBeVisible();

    // Rashi leads the Tanakh commentators: back link, "All Commentary", then Rashi.
    const rows = panel(page).getByRole("link");
    await expect(rows.nth(0)).toContainText("Resources");
    await expect(rows.nth(1)).toContainText("All Commentary");
    await expect(rows.nth(2)).toContainText("Rashi");
    await rows.nth(2).click();
    await expect(page).toHaveURL(/with=Rashi(&|$)/);
    await expect(panel(page).getByRole("heading", { name: "Rashi" })).toBeVisible();
    await expect(panel(page).getByText(/IN THE BEGINNING/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(panel(page).locator("li[data-ref]")).toHaveCount(3);

    await panel(page).getByRole("link", { name: "Commentary" }).first().click(); // back
    await expect(panel(page).getByRole("link", { name: /All Commentary/ })).toBeVisible();
    await panel(page).getByRole("link", { name: "Resources" }).click();
    await expect(panel(page).getByRole("heading", { name: "Related Texts" })).toBeVisible();
  });

  test("a sidebar link is a real link: its address opens the same view", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=all&lang=en");
    const href = await panel(page).getByRole("link", { name: /^Commentary/ }).getAttribute("href");
    expect(href).toBe("/Genesis.1.1?lang=en&with=Commentary+ConnectionsList"); // parameter order as sefaria.org writes it
    await open(page, href!);
    await expect(panel(page).getByRole("link", { name: /All Commentary/ })).toBeVisible();
  });

  test("deep link straight to a commentator", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=Rashi&lang=en");
    await expect(panel(page).getByRole("heading", { name: "Rashi" })).toBeVisible();
    await expect(panel(page).locator("li[data-ref]")).toHaveCount(3, { timeout: 15_000 });
  });

  test("Hebrew view of the commentary shows the source text", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=Rashi&lang=he");
    await expect(panel(page).locator("li[data-ref]").first()).toContainText("בראשית", { timeout: 15_000 });
  });

  test("closing the sidebar returns to the full-width text", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=all&lang=en");
    await panel(page).getByRole("button", { name: "Close" }).click();
    await expect(panel(page)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has("with")).toBe(false);
  });

  test("selecting the highlighted verse again closes the sidebar", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=all&lang=en");
    await page.locator('[role="group"][data-ref="Genesis 1:1"]').click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("selecting another verse keeps the current view, now for that verse", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=Rashi&lang=en");
    await expect(panel(page).locator("li[data-ref]")).toHaveCount(3, { timeout: 15_000 });
    await page.locator('[role="group"][data-ref="Genesis 1:2"]').click();
    await expect(page).toHaveURL(/\/Genesis\.1\.2\?.*with=Rashi/);
    await expect(panel(page).locator("li[data-ref]")).toHaveCount(5, { timeout: 15_000 }); // Rashi has five comments on verse 2
    await expect(panel(page).locator("li[data-ref]").first()).toHaveAttribute("data-ref", /Rashi on Genesis 1:2:/);
  });

  test("a verse the commentator does not discuss says so", async ({ page }) => {
    await open(page, "/Genesis.1.3?with=Rashi&lang=en"); // Rashi has no comment on verse 3
    await expect(panel(page).getByText("No connections known for Rashi here.")).toBeVisible({ timeout: 15_000 });
  });

  test("the keyboard opens the sidebar from a focused verse", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.locator('[role="group"][data-ref="Genesis 1:2"]').focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await expect(page).toHaveURL(/\/Genesis\.1\.2/);
  });
});

// @feature CON-013
test("the Translations count is the translations of the selected VERSE, not of the whole section", async ({ page, request }) => {
  const versions = (await (await request.get("https://www.sefaria.org/api/texts/versions/Berakhot.2a.1")).json()) as { isSource: boolean }[];
  const expected = versions.filter((v) => !v.isSource).length;
  await open(page, "/Berakhot.2a.1?lang=en&with=all");
  await expect(page.getByRole("complementary").getByRole("link", { name: /^Translations/ })).toHaveText(new RegExp(`Translations\\s*\\(${expected}\\)`), { timeout: 30_000 });
});

// @feature CON-013 @feature CON-014 @feature CON-015 @feature CON-017
test("the Resources home matches sefaria.org's: top tools, related texts, resources with counts, tools", async ({ page }) => {
  await open(page, "/Genesis.1.1?lang=en&with=all");
  const side = page.getByRole("complementary");
  for (const name of ["About this Text", "Table of Contents", "Search in this Text"]) await expect(side.getByRole("link", { name })).toBeVisible();
  await expect(side.getByRole("link", { name: /^Translations/ })).toHaveText(/Translations\s*\(\d+\)/);
  const resources = side.getByRole("region", { name: "Resources" });
  await expect(resources.getByRole("link", { name: /Sheets/ })).toHaveText(/\(\d+\)/, { timeout: 30_000 });
  await expect(resources.getByRole("link", { name: /Sheets/ })).toHaveAttribute("href", "https://voices.sefaria.org/sheets-with-ref/Genesis.1.1");
  for (const name of [/Web Pages/, /Topics/, /Manuscripts/, /Torah Readings/]) await expect(resources.getByRole("link", { name })).toBeVisible();
  await expect(side.getByRole("region", { name: "Tools" }).getByRole("link")).toHaveText(["Add to Sheet", "Dictionaries", "Notes", "Share", "Feedback", "Advanced"]);
});

test("a view not built yet says so and links to the same view on sefaria.org", async ({ page }) => {
  await open(page, "/Genesis.1.1?lang=en&with=Guide");
  await expect(page.getByRole("complementary").getByRole("link", { name: "Open it on sefaria.org" })).toHaveAttribute("href", /^https:\/\/www\.sefaria\.org\/Genesis\.1\.1\?.*with=Guide/);
});

// @feature TXD-047 @feature CON-029
test.describe("connection dots", () => {
  test("verses with connections get a dot once links load", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    const dot = page.locator('[data-ref="Genesis 1:1"] span[style*="opacity"]').first();
    await expect(dot).toBeVisible();
    await expect.poll(async () => Number(await dot.evaluate((el) => (el as HTMLElement).style.opacity))).toBeGreaterThan(0.2);
  });

  test("the dots follow the sidebar filter", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=Rashi&lang=en");
    const dot = page.locator('[data-ref="Genesis 1:1"] span[style*="opacity"]').first();
    // 3 Rashi comments: opacity (3+20)/100 = 0.23
    await expect.poll(async () => Number(await dot.evaluate((el) => (el as HTMLElement).style.opacity)), { timeout: 15_000 }).toBeCloseTo(0.23, 2);
  });
});

// @feature SHL-039 Panel widths
// @feature TXD-055 @feature TXD-067 @feature CON-012
test.describe("with the sidebar open, the highlight and the sidebar follow the reader", () => {
  test("a clicked verse stays highlighted while the column narrows beside the sidebar", async ({ page }) => {
    await open(page, "/Genesis.1.10?lang=bi");
    const box = await page.locator('[role="group"][data-ref="Genesis 1:12"]').boundingBox();
    await page.mouse.click(box!.x + 100, box!.y + 20);
    await expect(panel(page)).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.locator('[data-focused="true"]')).toHaveAttribute("data-ref", "Genesis 1:12");
    await expect(page).toHaveURL(/\/Genesis\.1\.12\?/);
  });

  test("scrolling moves the highlight, the address and the sidebar to the next verses", async ({ page }) => {
    await open(page, "/Genesis.1.1?with=Rashi&lang=en");
    await expect(panel(page).locator("li[data-ref]")).toHaveCount(3, { timeout: 15_000 });
    await wheel(page, 250, 3);
    await expect.poll(() => page.locator('[data-focused="true"]').getAttribute("data-ref")).not.toBe("Genesis 1:1");
    await page.waitForTimeout(500); // let scrolling settle; the address bar follows once it does
    const now = await page.locator('[data-focused="true"]').getAttribute("data-ref");
    const verse = now!.split(":")[1];
    await expect(page).toHaveURL(new RegExp(`/Genesis\\.1\\.${verse}\\?.*with=Rashi`));
    // The sidebar now shows Rashi on that verse (or says he has none there).
    await expect
      .poll(async () => {
        const first = await panel(page).locator("li[data-ref]").first().getAttribute("data-ref", { timeout: 500 }).catch(() => null);
        return first?.startsWith(`Rashi on Genesis 1:${verse}:`) || (await panel(page).getByText("No connections known for Rashi here.").count()) > 0;
      }, { timeout: 15_000 })
      .toBe(true);
    expect(await page.locator('[data-focused="true"]').count()).toBe(1);
  });
});

test("the sidebar sits beside the text on desktop", async ({ page }) => {
  await open(page, "/Genesis.1.1?with=all&lang=en");
  const text = await page.locator("[data-language]").first().boundingBox();
  const side = await panel(page).boundingBox();
  expect(side!.x).toBeGreaterThan(text!.x + text!.width - 1);
  expect(side!.width / 1280).toBeGreaterThan(0.25);
  expect(side!.width / 1280).toBeLessThan(0.4);
});

// @feature TXD-064
test("English Tanakh offers 'Want to change the translation?' once; Go to translations opens the list", async ({ page }) => {
  await open(page, "/Genesis.1?lang=en");
  const banner = page.getByRole("region", { name: "Suggestion" });
  await expect(banner).toContainText("Want to change the translation?", { timeout: 25_000 });
  await banner.getByRole("button", { name: "Go to translations" }).click();
  await expect(page).toHaveURL(/with=Translations/);
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByRole("region", { name: "Suggestion" })).toHaveCount(0);
});

test("no banner in Hebrew-only", async ({ page }) => {
  await open(page, "/Genesis.1?lang=he");
  await expect(page.locator('[role="group"]').first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("region", { name: "Suggestion" })).toHaveCount(0);
});

// @feature CON-045 @feature TXD-022
test("clicking a name in the text opens who or what it is in the sidebar; another verse closes it", async ({ page }) => {
  await open(page, "/Berakhot.2a?lang=en");
  const link = page.locator('[role="group"] a[data-slug="rabbi-eliezer-b-hyrcanus"]').first();
  await expect(link).toBeVisible({ timeout: 25_000 });
  await link.click();
  await expect(page).toHaveURL(/namedEntity=rabbi-eliezer-b-hyrcanus.*with=Lexicon|with=Lexicon.*namedEntity=rabbi-eliezer-b-hyrcanus/);
  const side = page.getByRole("complementary");
  await expect(side.getByRole("link", { name: "Rabbi Eliezer b. Hyrcanus" })).toHaveAttribute("href", "https://www.sefaria.org/topics/rabbi-eliezer-b-hyrcanus");
  await expect(side).toContainText("Tannaim - Third Generation");
  await expect(side).toContainText("rabbinic sage");
  // (inline segments overlap in running text, so choose the verse with the keyboard)
  await page.locator('[role="group"][data-ref="Berakhot 2a:6"]').focus();
  await page.keyboard.press("Enter");
  await expect(side.getByRole("link", { name: "About this Text" })).toBeVisible();
  await expect(page).not.toHaveURL(/namedEntity/);
});

// @feature CON-003 @feature CON-070 @feature SHL-014 @feature RTE-043
test.describe("the sidebar's language button", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("switches the sidebar to Hebrew (lang2) without touching the text's language", async ({ page }) => {
    await page.goto("/Genesis.1.3?lang=bi&with=Rashi");
    await page.waitForSelector("html[data-hydrated='true']");
    const side = page.getByRole("complementary");
    await side.getByRole("button", { name: "Hebrew Language Toggle Icon" }).click();
    await expect(page).toHaveURL(/lang2=he/);
    await expect(page).toHaveURL(/lang=bi/);
    await expect(side.getByRole("button", { name: "English Language Toggle Icon" })).toBeVisible();
    await side.getByRole("button", { name: "English Language Toggle Icon" }).click();
    await expect(page).toHaveURL(/lang2=en/);
  });
});
