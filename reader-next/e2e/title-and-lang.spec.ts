import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * The panel title names the panel's current ref as www.sefaria.org's header does (lib/reader/header.ts titleVerses): the address it
 * arrived at until the reader scrolls, then the section in view. And the address's `lang`: its other spellings, and written on change.
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

  test("the same rule in bilingual mode and with a Hebrew interface", async ({ page }) => {
    await open(page, "/Genesis.1.4?lang=bi");
    await expect(title(page)).toHaveText("Genesis 1:4");
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/Genesis.1.4?lang=bi");
    await expect(title(page)).toHaveText("בראשית א׳:ד׳");
  });

  test("a Torah portion keeps its verses in the title when the reader chooses one of them", async ({ page }) => {
    // the sidebar's version list for the chosen verse is not recorded; it plays no part here
    await page.route("**/api/texts/versions/Genesis%206%3A12", (r) => r.fulfill({ json: [] }));
    await open(page, "/Genesis.6.9-11.32?lang=en");
    await expect(title(page)).toHaveText("Genesis 6:9-22");
    await page.locator('[data-reader-scroller] [role="group"][data-ref="Genesis 6:12"]').click();
    await expect(page).toHaveURL(/with=/);
    await expect(title(page)).toHaveText("Genesis 6:9-22");
  });

  test("a segment of a named section follows it with a space", async ({ page }) => {
    await open(page, "/Pesach_Haggadah,_Magid,_First_Fruits_Declaration.2?lang=en");
    await expect(title(page)).toHaveText("Pesach Haggadah, Magid, First Fruits Declaration 2");
  });

  test("choosing a verse opens the sidebar and leaves the title on the section", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.locator('[data-reader-scroller] [role="group"][data-ref="Genesis 1:3"]').click();
    await expect(page).toHaveURL(/with=/);
    await expect(title(page)).toHaveText("Genesis 1");
  });

  // A range of lines inside one daf ("Berakhot 2a:3-5") is covered by src/lib/reader/header.test.ts: its text request is not in the
  // recorded API cassette.

  test("a range of whole sections is titled with its first section", async ({ page }) => {
    await open(page, "/Genesis.6-8?lang=en");
    await expect(title(page)).toHaveText("Genesis 6");
  });

  test("under a Hebrew interface the version's name stays English, left to right, its start in view", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/Genesis.1?lang=bi");
    const line = page.locator('section[data-panel-id="p1"] header').getByText("Revised JPS, 2023");
    await expect(line).toHaveAttribute("lang", "en");
    const style = await line.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { dir: cs.direction, font: cs.fontFamily, width: Math.round(el.closest("header")!.querySelector("h1")!.parentElement!.getBoundingClientRect().width) };
    });
    expect(style.dir).toBe("ltr");
    expect(style.font).toMatch(/Cardo/);
    expect(style.width).toBe(420);
  });

  test("the verse the address named is tinted on arrival, through scrolling, until the reader clicks elsewhere", async ({ page }) => {
    await open(page, "/Genesis.1.4?lang=en");
    const verse = page.locator('[data-reader-scroller] [role="group"][data-ref="Genesis 1:4"]');
    const tint = () => verse.evaluate((el) => getComputedStyle(el).backgroundColor);
    // sefaria.org's focus tint, #f5faff
    await expect.poll(tint).toBe("rgb(245, 250, 255)");
    await expect(page.locator('[data-reader-scroller] [role="group"][data-ref="Genesis 1:5"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await verse.hover();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(400);
    expect(await tint()).toBe("rgb(245, 250, 255)");
    await page.locator('section[data-panel-id="p1"] header').first().click({ position: { x: 4, y: 30 } });
    await expect.poll(tint).toBe("rgba(0, 0, 0, 0)");
  });

  test("lang=he-en and lang=en-he open the text bilingual", async ({ page }) => {
    for (const lang of ["he-en", "en-he"]) {
      await open(page, `/Genesis.1?lang=${lang}`);
      await expect(page.locator('[data-language="bilingual"]').first()).toBeAttached();
    }
  });

  test("changing the language writes lang= into the address, even when it had none (the address is completed on every change)", async ({ page }) => {
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
