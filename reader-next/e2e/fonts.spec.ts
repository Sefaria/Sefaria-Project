import { expect, test } from "@playwright/test";
import { GARAMOND_FILES, TYPEKIT_CSS } from "../src/lib/fonts/typekit";
import { open } from "./helpers";

// @feature TXD-060
test.describe("text faces as on sefaria.org", () => {
  test("English text is Adobe Garamond Pro from the old site's kit; Cardo only for Greek", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      return { garamond: document.fonts.check('18px "adobe-garamond-pro"'), cardoUsed: [...document.fonts].some((f) => f.family === "Cardo" && f.status === "loaded") };
    });
    expect(faces.garamond).toBe(true);
    expect(faces.cardoUsed).toBe(false); // no Greek on Genesis 1
  });

  test("the preloaded kit files are the ones the kit stylesheet declares (fails if Adobe republishes the kit)", async ({ request }) => {
    const css = await (await request.get(TYPEKIT_CSS)).text();
    for (const url of Object.values(GARAMOND_FILES)) expect(css).toContain(url);
  });
});
