import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary");

// @feature CON-052 @feature CON-053 @feature CON-054 @feature RTE-044
test.describe("Web pages citing the passage (verified against sefaria.org, Berakhot 2a:1)", () => {
  test("the sites, most pages first; a site opens its pages; back returns to the sites", async ({ page }) => {
    await open(page, "/Berakhot.2a.1?lang=en&with=WebPages");
    const sites = side(page).getByRole("link").filter({ hasText: /\(\d+\)/ });
    await expect(sites.first()).toHaveText(/Halachipedia \(145\)/, { timeout: 30_000 });
    await expect(sites.nth(1)).toHaveText(/Torat Har Etzion \(\d+\)/);
    await expect(side(page).getByText("Sites that are listed here use the")).toBeVisible();
    await sites.first().click();
    await expect(page).toHaveURL(/with=WebPage:Halachipedia/);
    const pages = side(page).getByRole("listitem");
    await expect(pages.first()).toBeVisible();
    await expect(pages.first()).toContainText("Citing:");
    await expect(pages.first().getByRole("link").first()).toHaveAttribute("target", "_blank");
    await side(page).getByRole("link", { name: "Web Pages" }).click();
    await expect(page).toHaveURL(/with=WebPages/);
    await expect(sites.first()).toBeVisible();
  });

  test("a link straight to one site's pages", async ({ page }) => {
    await open(page, "/Berakhot.2a.1?lang=en&with=WebPage:Hadran");
    await expect(side(page).getByRole("listitem").first()).toBeVisible({ timeout: 30_000 });
  });

  test("the Resources row shows no number until its pages have been loaded (as on sefaria.org), then the count", async ({ page }) => {
    await open(page, "/Berakhot.2a.1?lang=en&with=all");
    const row = side(page).getByRole("link", { name: /^Web Pages/ });
    await expect(side(page).getByRole("link", { name: /^Sheets/ })).toHaveText(/\(\d+\)/, { timeout: 30_000 });
    await expect(row).toHaveText(/^Web Pages\s*$/);
    await row.click();
    await expect(side(page).getByRole("link").filter({ hasText: /Halachipedia \(145\)/ })).toBeVisible({ timeout: 30_000 });
    await side(page).getByRole("link", { name: "Resources" }).click();
    await expect(side(page).getByRole("link", { name: /^Web Pages/ })).toHaveText(/Web Pages\s*\(\d+\)/);
  });

  test("from Resources: the Web Pages row leads here", async ({ page }) => {
    await open(page, "/Berakhot.2a.1?lang=en&with=all");
    await side(page).getByRole("link", { name: /^Web Pages/ }).click();
    await expect(page).toHaveURL(/with=WebPages/);
  });
});
