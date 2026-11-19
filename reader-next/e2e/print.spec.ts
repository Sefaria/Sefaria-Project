import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature TXD-062 @feature PLT-030 Print (legacy static/css/s2-print.css, linked media=print on every reader page): the site header,
// the sidebar, the text header's buttons, the connection dots and the footnote markers are not printed; segment numbers are
test("printing the reader leaves out the header, sidebar, buttons, dots and footnote markers, and keeps the verse numbers", async ({ page }) => {
  await open(page, "/Genesis.1.1?lang=en&with=all");
  const verse = page.locator('[role="group"]:has(sup.note-marker)').first();
  await expect(page.locator("aside").first()).toBeVisible({ timeout: 25_000 });
  await expect(verse.locator("sup").first()).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header").first()).toBeHidden();
  await expect(page.locator("aside").first()).toBeHidden();
  await expect(page.getByRole("button", { name: /^Save "/ })).toBeHidden();
  await expect(verse.locator("[data-number]")).toBeVisible();
  await expect(verse.locator("sup").first()).toBeHidden();
  await expect(verse.locator('[data-no-select="true"]').first()).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator("aside").first()).toBeVisible();
});
