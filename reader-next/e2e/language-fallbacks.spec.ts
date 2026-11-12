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

  test("an English-original work in Hebrew mode with a Hebrew interface keeps Hebrew mode and English labels", async ({ page }) => {
    // sefaria.org (measured 2026-11-12, interface Hebrew, lang=he): the panel stays in Hebrew mode and labels the work in its source's
    // language, English: an English section header and title. The panel is not turned bilingual.
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/On_the_Account_of_the_World's_Creation.1?lang=he");
    const seg = page.locator('[role="group"][data-ref="On the Account of the World\'s Creation 1:1"]');
    await expect(seg).toContainText("While among other lawgivers", { timeout: 25_000 });
    await expect(seg.locator("[data-number]")).toHaveText("1");
    await expect(page.locator(`section[data-ref="On the Account of the World's Creation 1"] h2`)).toHaveAttribute("lang", "en");
    await expect(page.locator("header h1 [lang], header h2 [lang]").first()).toHaveAttribute("lang", "en");
    await expect(page.locator("[data-language]").first()).toHaveAttribute("data-language", "hebrew");
  });

  for (const iface of ["english", "hebrew"] as const) {
    test(`an English-only work served as a translation, in Hebrew mode (${iface} interface): number on the left, English title at 18px`, async ({ page }) => {
      // Teshuvot haRashba has no source version; its English comes as the translation. sefaria.org (measured 2026-11-12, 1280px):
      // the panel stays in Hebrew mode, the number sits left of the English (242px), the title is English at 18px.
      if (iface === "hebrew") await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
      await open(page, "/Teshuvot_haRashba_part_I.98?lang=he");
      const seg = page.locator('[role="group"][data-ref^="Teshuvot haRashba part I 98:"]').first();
      await expect(seg.locator('[data-side="translation"]')).toBeVisible({ timeout: 25_000 });
      const m = await seg.evaluate((s) => {
        const n = s.querySelector("[data-number]")!.getBoundingClientRect();
        const t = s.querySelector("[data-side]")!.getBoundingClientRect();
        return { left: n.right <= t.left, num: s.querySelector("[data-number]")!.textContent };
      });
      expect(m.left).toBe(true);
      expect(m.num).toMatch(/^\d+$/);
      const title = page.locator("header h1 [lang], header h2 [lang]").first();
      await expect(title).toHaveAttribute("lang", "en");
      expect(await title.evaluate((e) => getComputedStyle(e).fontSize)).toBe("18px");
    });
  }

  test("Arukh HaShulchan in English: an empty-string translation entry is no entry, the Hebrew shows (5:1)", async ({ page }) => {
    // sefaria.org: OC 5's English starts at 5:2; 5:1's entry is "" and shows the Hebrew (a whitespace entry, 1:11, stays blank)
    await open(page, "/Arukh_HaShulchan,_Orach_Chaim.5?lang=en");
    const seg = page.locator('[role="group"][data-ref="Arukh HaShulchan, Orach Chaim 5:1"]');
    await expect(seg.locator('[data-side="primary"]')).toBeVisible({ timeout: 25_000 });
    expect((await seg.boundingBox())!.height).toBeGreaterThan(40);
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
    // the number itself (a /^טו\b/ match on the verse failed in CI: \b is no boundary between Hebrew letters, so it relied on a space)
    await expect(page.locator('[role="group"][data-ref="Psalms 119:15"] [data-number="true"]')).toHaveText("טו", { timeout: 25_000 });
  });
});
