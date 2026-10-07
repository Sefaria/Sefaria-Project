import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const side = (page: Page) => page.getByRole("complementary");

// @feature CON-060 @feature CON-059 @feature CON-014
test.describe("Manuscripts and Torah readings (verified against sefaria.org, Genesis 1:1)", () => {
  test("the manuscript page: thumbnail, title, location, courtesy, licence, source", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    const row = side(page).getByRole("link", { name: /^Manuscripts/ });
    await expect(row).toHaveText(/\(1\)/, { timeout: 30_000 });
    await row.click();
    await expect(page).toHaveURL(/with=manuscripts/);
    await expect(side(page).getByText("Leningrad Codex (1008 CE)")).toBeVisible();
    await expect(side(page).getByText("LC Folio 1v")).toBeVisible();
    await expect(side(page).getByRole("link", { name: "dornsife.usc.edu" })).toBeVisible();
    await expect(side(page).getByRole("img", { name: "Ancient Manuscript" }).locator("xpath=ancestor::a")).toHaveAttribute("href", /\.jpg$/);
  });

  test("the Torah reading: PocketTorah, a 0:06 clip, licence, source", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await expect(side(page).getByRole("link", { name: /^Torah Readings/ })).toHaveText(/\(1\)/, { timeout: 30_000 });
    await side(page).getByRole("link", { name: /^Torah Readings/ }).click();
    await expect(page).toHaveURL(/with=Torah(\+|%20)Readings/);
    await expect(side(page).getByRole("heading", { name: "PocketTorah" })).toBeVisible();
    await expect(side(page).getByText("0:00 / 0:06")).toBeVisible();
    await expect(side(page).getByRole("link", { name: "PocketTorah" })).toHaveAttribute("href", "http://www.pockettorah.com");
    await expect(side(page).getByRole("slider", { name: "Audio playback position" })).toBeVisible();
  });
});
