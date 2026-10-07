import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary", { name: "Search in this text" });

// @feature SRC-094 @feature SRC-095 @feature SRC-096
test.describe("Search in this text (verified against sefaria.org)", () => {
  test("Genesis, 'light': the matches in order, matched words bold, versions beneath; the query is in the URL", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=light");
    const results = side(page).getByRole("article");
    await expect(results.first()).toBeVisible({ timeout: 25_000 });
    await expect(results.nth(0).getByRole("link", { name: "Genesis 1:3" })).toBeVisible();
    await expect(results.nth(1).getByRole("link", { name: "Genesis 1:4" })).toBeVisible();
    await expect(results.nth(0).locator("b").first()).toHaveText(/light/i);
    await expect(results.nth(0).getByRole("button", { name: /\d+ more versions?/ })).toBeVisible();
    await expect(side(page).getByRole("searchbox")).toHaveValue("light");
  });

  test("a new query replaces the last and lands in the URL; no match says so", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=light");
    await expect(side(page).getByRole("article").first()).toBeVisible({ timeout: 25_000 });
    const box = side(page).getByRole("searchbox");
    await box.fill("zzzxqkw");
    await box.press("Enter");
    await expect(page).toHaveURL(/sbsq=zzzxqkw/);
    await expect(side(page).getByText("0 results.")).toBeVisible({ timeout: 25_000 });
  });

  test("a Hebrew query finds Hebrew text", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=" + encodeURIComponent("אור"));
    const first = side(page).getByRole("article").first();
    await expect(first).toBeVisible({ timeout: 25_000 });
    await expect(first.locator('[lang="he"] b').first()).toBeVisible();
  });

  test("clicking a result takes the text there in that version, the sidebar staying on the results", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=light");
    await side(page).getByRole("article").nth(3).getByRole("link").first().click(); // Genesis 1:14 (Kehot) in the old order
    await expect(page).toHaveURL(/\/Genesis\.1\.14\b.*ven=/);
    await expect(page).toHaveURL(/with=SidebarSearch/);
    await expect(side(page).getByRole("article").first()).toBeVisible();
  });

  test("it is one click from Resources", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await page.getByRole("complementary").getByRole("link", { name: "Search in this Text" }).click();
    await expect(side(page).getByRole("searchbox")).toBeVisible({ timeout: 20_000 });
  });
});
