import { expect, test } from "@playwright/test";
import { open } from "./helpers";

/** The header's lines, as text (the rows below were read off sefaria.org on 2026-10-05). */
const lines = async (page: import("@playwright/test").Page) =>
  page.locator("main header").first().evaluate((h) => {
    const center = h.querySelector("h1")!.parentElement!;
    return [...center.querySelectorAll("h1, div > span, div > a")].map((e) => e.textContent!.trim()).filter(Boolean);
  });

// @feature TXD-013 @feature VER-005 @feature TXT-009
test.describe("the header says what sefaria.org's does", () => {
  const cases: [string, string[]][] = [
    ["/Genesis.1?lang=en", ["Genesis 1", "Revised JPS, 2023"]],
    ["/Genesis.1?lang=he", ["בראשית א׳"]], // Hebrew only: Hebrew title, no version label
    ["/Genesis.1?lang=bi", ["Genesis 1", "Revised JPS, 2023"]],
    ["/Berakhot.2a?lang=en", ["Berakhot 2a", "The William Davidson Talmud", "(Koren - Steinsaltz)"]],
    ["/Berakhot.2a?lang=he", ["ברכות ב׳ א", "תלמוד מהדורת ויליאם דוידסון"]],
    ["/Mishnah_Berakhot.1?lang=en", ["Mishnah Berakhot 1", "Koren - Steinsaltz"]], // no attribution outside the Bavli
    ["/Zohar,_Bereshit.1?lang=en", ["ספר הזהר, בראשית א׳", "Hebrew Translation"]], // the "translation" is Hebrew
    ["/Pirkei_Avot.1?lang=he", ["משנה אבות א׳"]],
  ];
  for (const [path, expected] of cases) {
    test(path, async ({ page }) => {
      await open(page, path);
      expect(await lines(page)).toEqual(expected);
    });
  }
});

// @feature SRC-017
test.describe("Hebrew keyboard in the header search", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the icon shows on focus; keys type Hebrew; Escape closes it", async ({ page }) => {
    await open(page, "/texts");
    await expect(page.getByRole("button", { name: "Hebrew keyboard" })).toHaveCount(0);
    const box = page.getByRole("combobox");
    await box.click();
    await page.getByRole("button", { name: "Hebrew keyboard" }).click();
    const kb = page.getByRole("group", { name: "Hebrew keyboard" });
    await kb.getByRole("button", { name: "א", exact: true }).click();
    await kb.getByRole("button", { name: "ו", exact: true }).click();
    await kb.getByRole("button", { name: "ר", exact: true }).click();
    await expect(box).toHaveValue("אור");
    await expect(box).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(kb).toHaveCount(0);
  });
});
