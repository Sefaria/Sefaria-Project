import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature GUI-004 @feature CON-011 @feature CON-048 @feature CON-055 @feature CON-062 @feature CON-065
test.describe("tools that need an account (verified against sefaria.org, signed out)", () => {
  test("Notes opens the sign-up modal over Resources; closing returns to Resources", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await page.getByRole("complementary").getByRole("link", { name: "Notes" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Don’t lose that thought!");
    await expect(dialog.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", /^https:\/\/www\.sefaria\.org\/register\?next=/);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/with=all/);
  });

  test("Add to Sheet, and from Advanced: Add Translation and Add Connection", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await page.getByRole("complementary").getByRole("link", { name: "Add to Sheet" }).click();
    await expect(page.getByRole("dialog")).toContainText("Want to make your own source sheet?");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("complementary").getByRole("link", { name: "Advanced" }).click();
    await page.getByRole("complementary").getByRole("link", { name: "Add Translation" }).click();
    await expect(page.getByRole("dialog")).toContainText("Have your own translation of this text?");
    await page.keyboard.press("Escape");
    await page.getByRole("complementary").getByRole("link", { name: "Add Connection" }).click();
    await expect(page.getByRole("dialog")).toContainText("Want to document a connection to another text?");
  });
});
