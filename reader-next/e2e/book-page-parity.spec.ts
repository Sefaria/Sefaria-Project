import { expect, test, type Locator, type Page } from "@playwright/test";
import { open } from "./helpers";

/*
 * The book page against sefaria.org (2026-11-18, Playwright, /Genesis at 375x812 and 1280x900; s2.css .textTableOfContents,
 * .readerPanel .navSidebarModule h1): the title on a 39px line with the category 10px under it; "Chapters" and "Torah Portions"
 * 16px #666; a chapter tile 50px with 3px round it, its number 18px weight 100 #666; a portion's name 24px, the portions 60px apart;
 * the sidebar's headings 22px weight 500 #666; on a phone the description #666 on a normal line.
 */
const css = (l: Locator, p: string) => l.evaluate((e, prop) => getComputedStyle(e).getPropertyValue(prop), p);
const contents = (page: Page) => page.locator("[data-variant='page']");

async function checkContents(page: Page) {
  const chapters = contents(page).getByText("Chapters", { exact: true });
  await expect(chapters).toBeVisible({ timeout: 20_000 });
  expect(await css(chapters, "font-size")).toBe("16px");
  expect(await css(chapters, "color")).toBe("rgb(102, 102, 102)");
  const one = contents(page).getByRole("link", { name: "1", exact: true }).first();
  expect(await css(one, "font-size")).toBe("18px");
  expect(await css(one, "font-weight")).toBe("100");
  expect(await css(one, "margin-top")).toBe("3px");
  const bereshit = contents(page).getByRole("link", { name: "Bereshit", exact: true }).first();
  const lech = contents(page).getByRole("link", { name: "Lech Lecha", exact: true }).first();
  expect(await css(bereshit, "font-size")).toBe("24px");
  expect(Math.round((await lech.boundingBox())!.y - (await bereshit.boundingBox())!.y)).toBe(60);
  const title = page.getByRole("heading", { level: 1, name: "Genesis" });
  expect(await css(title, "line-height")).toBe("39px");
}

test("desktop: the contents and the sidebar's headings as sefaria.org's", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/Genesis");
  await checkContents(page);
  const related = page.getByRole("complementary").getByRole("heading", { name: "Related Topics" });
  expect(await css(related, "font-size")).toBe("22px");
  expect(await css(related, "font-weight")).toBe("500");
  expect(await css(related, "color")).toBe("rgb(102, 102, 102)");
});

// @feature LIB-020
test("phone: the contents as sefaria.org's, the description #666 on a normal line @mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "/Genesis");
  await checkContents(page);
  const desc = page.getByText(/is the first book of the Torah/).first();
  expect(await css(desc, "color")).toBe("rgb(102, 102, 102)");
  expect(await css(desc, "line-height")).toBe("normal");
});
