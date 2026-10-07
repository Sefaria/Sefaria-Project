import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary");
const about = (page: Page) => side(page).getByRole("region", { name: "About This Text" });

// @feature CON-039 @feature VER-006 @feature VER-016 @feature VER-017 @feature VER-008 @feature BOK-022 @feature CON-013
test.describe("About this Text (verified against sefaria.org)", () => {
  test("Genesis: details, the current translation with its notes, the source versions, downloads", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=About");
    await expect(about(page).getByRole("link", { name: "Genesis" })).toHaveAttribute("href", "/Genesis", { timeout: 20_000 });
    await expect(about(page)).toContainText("Composed: Sinai/Canaan (c.1400 – c.400 BCE)");
    await expect(about(page)).toContainText("is the first book of the Torah");
    const current = side(page).getByRole("region", { name: "Current Translation" });
    await expect(current.getByRole("heading", { name: /THE JPS TANAKH/ })).toBeVisible();
    await expect(current.getByRole("link", { name: "Preface" })).toBeVisible();
    await expect(current.getByRole("link", { name: "jps.org" })).toBeVisible();
    await expect(side(page).getByRole("region", { name: "Source Versions" }).getByRole("heading", { name: "Miqra according to the Masorah" })).toBeVisible();
    await expect(side(page).getByRole("region", { name: "Download Text" })).toBeVisible();
  });

  test("Berakhot: the Talmud's three other source versions, topics (five, then More), composition", async ({ page }) => {
    await open(page, "/Berakhot.2a.1?lang=en&with=About");
    await expect(about(page)).toContainText("Composed: Talmudic Babylon (c.450 – c.550 CE)", { timeout: 20_000 });
    const sources = side(page).getByRole("region", { name: "Source Versions" });
    await expect(sources.getByRole("heading", { level: 3 }).filter({ hasText: /Aramaic|Wikisource/ })).toHaveCount(3);
    const topics = side(page).getByRole("region", { name: "Related Topics" });
    await expect(topics.getByRole("listitem")).toHaveCount(5);
    await expect(topics.getByRole("button", { name: "More" })).toBeVisible();
  });

  test("a commentary shows its author", async ({ page }) => {
    await open(page, "/Rashi_on_Genesis.1.1.1?lang=en&with=About");
    await expect(about(page).getByText("Author:")).toBeVisible({ timeout: 20_000 });
    await expect(about(page).getByRole("link", { name: "Rashi", exact: true })).toHaveAttribute("href", "https://www.sefaria.org/topics/rashi");
  });

  test("it is one click from Resources, and back", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await side(page).getByRole("link", { name: "About this Text" }).click();
    await expect(page).toHaveURL(/with=About/);
    await expect(about(page)).toBeVisible();
    await side(page).getByRole("link", { name: "Resources" }).click();
    await expect(page).toHaveURL(/with=all/);
  });

  test("Select Version chooses a source version: bilingual, in the URL, 'Current Version' appears (as on sefaria.org)", async ({ page }) => {
    await open(page, "/Berakhot.2a.1?lang=en&with=About");
    const sources = side(page).getByRole("region", { name: "Source Versions" });
    await expect(sources).toBeVisible({ timeout: 20_000 });
    await sources.getByRole("link", { name: "Select William Davidson Edition - Aramaic" }).click();
    await expect(page).toHaveURL(/vhe=hebrew\|William_Davidson_Edition_-_Aramaic/);
    await expect(page).toHaveURL(/lang=bi/);
    await expect(side(page).getByRole("region", { name: "Current Version" }).getByRole("heading", { name: "William Davidson Edition - Aramaic" })).toBeVisible();
    await expect(side(page).getByText("Alternate Source Versions")).toBeVisible();
    const regions = await side(page).getByRole("region").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(regions.indexOf("Current Version")).toBeLessThan(regions.indexOf("Current Translation")); // bilingual: source first
  });

  // @feature TXD-006 @feature VER-003
  test("choosing a source version swaps the Hebrew text in place, without moving the reader", async ({ page }) => {
    const NIQQUD = /[\u05B0-\u05C7]/;
    await open(page, "/Berakhot.2a.1?lang=he&with=About");
    const verse = page.locator('[role="group"][data-ref="Berakhot 2a:1"]');
    await expect(verse).toContainText(NIQQUD); // the default source is the vocalized edition
    const top = await verse.evaluate((e) => e.getBoundingClientRect().top);
    const sources = side(page).getByRole("region", { name: "Source Versions" });
    await expect(sources).toBeVisible({ timeout: 20_000 });
    await sources.getByRole("link", { name: "Select William Davidson Edition - Aramaic" }).click();
    await expect(page).toHaveURL(/vhe=hebrew\|William_Davidson_Edition_-_Aramaic/);
    await expect.poll(async () => NIQQUD.test((await verse.innerText()) ?? "")).toBe(false); // now the unvocalized edition
    expect(Math.abs((await verse.evaluate((e) => e.getBoundingClientRect().top)) - top)).toBeLessThan(2);
  });

  test("a version's title previews it in the sidebar (Version Open); back returns to About", async ({ page }) => {
    await open(page, "/Berakhot.2a.1?lang=en&with=About");
    const sources = side(page).getByRole("region", { name: "Source Versions" });
    await expect(sources).toBeVisible({ timeout: 20_000 });
    await sources.getByRole("link", { name: "William Davidson Edition - Aramaic" }).first().click();
    await expect(page).toHaveURL(/with=Version(\+|%20)Open/);
    await expect(page).toHaveURL(/vside=William_Davidson_Edition_-_Aramaic\|he/);
    await expect(side(page).getByRole("heading", { name: "William Davidson Edition - Aramaic" })).toBeVisible();
    await expect(side(page).locator("[lang=he]").first()).toContainText(/\S/, { timeout: 20_000 });
    await side(page).getByRole("link", { name: "About This Text" }).click();
    await expect(page).toHaveURL(/with=About/);
  });

  test("downloads: version and format chosen, the button becomes a link to the file", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=About");
    const dl = side(page).getByRole("region", { name: "Download Text" });
    await expect(dl).toBeVisible({ timeout: 20_000 });
    await expect(dl.getByRole("link", { name: "Download" })).toHaveAttribute("aria-disabled", "true");
    await dl.getByRole("combobox", { name: "Select Version" }).selectOption({ label: "Merged Version (Hebrew)" });
    await dl.getByRole("combobox", { name: "Select Format" }).selectOption("json");
    await expect(dl.getByRole("link", { name: "Download" })).toHaveAttribute("href", "https://www.sefaria.org/download/version/Genesis - he - merged.json");
  });
});
