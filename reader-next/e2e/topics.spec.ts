import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary");

// @feature CON-046 @feature CON-014
test.describe("Topics for the selected passage (verified against sefaria.org)", () => {
  test("Genesis 1:1: the same seven topics the Resources row counts, most prominent first", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    const row = side(page).getByRole("link", { name: /^Topics/ });
    await expect(row).toHaveText(/\(7\)/, { timeout: 30_000 });
    await row.click();
    await expect(page).toHaveURL(/with=Topics/);
    const items = side(page).getByRole("listitem");
    await expect(items).toHaveCount(7);
    await expect(items.nth(0)).toContainText("Creation");
    await expect(items.nth(0)).toContainText("The opening two chapters of the Torah describe how God created the world");
    await expect(items.nth(0).getByRole("link", { name: "Creation" })).toHaveAttribute("href", "https://www.sefaria.org/topics/creation");
    await expect(items.nth(1)).toContainText('"In the Beginning of"');
    await expect(items.nth(0).getByRole("img")).toHaveAttribute("aria-label", /connected to "Genesis 1:1" by Curation of the Sefaria Learning Team/);
  });

  test("the list follows the selected verse; back returns to Resources", async ({ page }) => {
    await open(page, "/Genesis.1.30?lang=en&with=Topics");
    await expect(side(page).getByRole("link", { name: "Parashat Bereshit" })).toBeVisible({ timeout: 30_000 });
    await side(page).getByRole("link", { name: "Resources" }).click();
    await expect(page).toHaveURL(/with=all/);
  });
});
