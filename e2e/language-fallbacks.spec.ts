import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature TXT-025 @feature TXD-045 @feature TXD-025
test.describe("language fallbacks and number rules (verified against sefaria.org)", () => {
  test("a text with nothing in Hebrew, asked for in Hebrew, shows its English with English numbers", async ({ page }) => {
    await open(page, "/On_the_Account_of_the_World's_Creation.1?lang=he");
    const seg = page.locator('[role="group"][data-ref="On the Account of the World\'s Creation 1:1"]');
    await expect(seg).toContainText("While among other lawgivers", { timeout: 25_000 });
    await expect(seg).toContainText(/^1\b/);
  });

  test("a Hebrew text with no translation, asked for in English, shows the Hebrew with Hebrew numerals", async ({ page }) => {
    await open(page, "/Peri_Megadim_on_Orach_Chayim,_Mishbezot_Zahav.1?lang=en");
    const seg = page.locator('[role="group"][data-ref="Peri Megadim on Orach Chayim, Mishbezot Zahav 1:1:1"]');
    await expect(seg).toContainText("יתגבר", { timeout: 25_000 });
    await expect(seg).toContainText(/^א/);
  });

  test("Arukh HaShulchan in English: an empty translation entry stays blank, beyond the translation the Hebrew shows", async ({ page }) => {
    await open(page, "/Arukh_HaShulchan,_Orach_Chaim.1?lang=en");
    const blank = page.locator('[role="group"][data-ref="Arukh HaShulchan, Orach Chaim 1:11"]');
    await expect(blank).toBeAttached({ timeout: 25_000 }); // an empty row has no height
    await expect(blank).not.toContainText("מיסודי");
    await expect(blank).toContainText(/^11/);
    await expect(page.locator('[role="group"][data-ref="Arukh HaShulchan, Orach Chaim 1:13"]')).toContainText("ומיסודי");
  });

  test("Ramban's mis-nested footnote markup does not leak footnote text", async ({ page }) => {
    await open(page, "/Ramban_on_Genesis.1.1?lang=en");
    const seg = page.locator('[role="group"][data-ref="Ramban on Genesis 1:1:3"]');
    await expect(seg).toContainText("Here again the word reshith", { timeout: 25_000 });
    await expect(seg).not.toContainText("It was thus for the sake of this meritorious person, of whom reshith was said, that the world was created. [Here");
  });

  test("Hebrew segment numbers carry no geresh", async ({ page }) => {
    await open(page, "/Psalms.119?lang=he");
    await expect(page.locator('[role="group"][data-ref="Psalms 119:15"]')).toContainText(/^טו\b/, { timeout: 25_000 });
  });
});
