import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * The panel title names the panel's current ref as www.sefaria.org's header does (lib/reader/header.ts titleVerses), and the
 * address's `lang` (R-TITLE-2, R-SET-4, R-SET-6, R-SET-8 in the language parity rules).
 */
const title = (page: Page) => page.locator('section[data-panel-id="p1"] header h1').first();

// @feature TXD-013 @feature RTE-043 @feature SHL-008
test.describe("panel title and the address's language", () => {
  test("a segment address is named in the title until the reader scrolls on", async ({ page }) => {
    await open(page, "/Genesis.1.4?lang=en");
    await expect(title(page)).toHaveText("Genesis 1:4");
    await page.locator('[data-reader-scroller] [role="group"][data-ref="Genesis 1:4"]').hover();
    await page.mouse.wheel(0, 900);
    await expect(title(page)).toHaveText("Genesis 1");
  });

  test("bilingual: the title names the section, as sefaria.org's does once both sides are laid out", async ({ page }) => {
    await open(page, "/Genesis.1.4?lang=bi");
    await expect(page.locator('[role="group"][data-ref="Genesis 1:4"]')).toBeVisible();
    await expect(title(page)).toHaveText("Genesis 1");
  });

  test("choosing a verse opens the sidebar and leaves the title on the section", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.locator('[data-reader-scroller] [role="group"][data-ref="Genesis 1:3"]').click();
    await expect(page).toHaveURL(/with=/);
    await expect(title(page)).toHaveText("Genesis 1");
  });

  // A range of lines inside one daf (Berakhot 2a:3-5 → "Berakhot 2a") is covered by src/lib/reader/header.test.ts: its text request
  // is not in the recorded API cassette.

  test("lang=he-en and lang=en-he open the text bilingual", async ({ page }) => {
    for (const lang of ["he-en", "en-he"]) {
      await open(page, `/Genesis.1?lang=${lang}`);
      await expect(page.locator('[data-language="bilingual"]').first()).toBeAttached();
    }
  });

  test("changing the language writes lang= into the address, even when it had none", async ({ page }) => {
    await open(page, "/Genesis.1");
    await page.getByRole("button", { name: "Text display options" }).click();
    await page.getByRole("radio", { name: "Source", exact: true }).click();
    await expect(page).toHaveURL(/[?&]lang=he(&|$)/);
    await page.getByRole("radio", { name: "Translation", exact: true }).click();
    await expect(page).toHaveURL(/[?&]lang=en(&|$)/);
  });

  test("an English-original work in Hebrew mode keeps its English title with a Hebrew interface", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/On_the_Account_of_the_World's_Creation.1?lang=he");
    await expect(title(page)).toHaveText("On the Account of the World's Creation 1");
  });
});
