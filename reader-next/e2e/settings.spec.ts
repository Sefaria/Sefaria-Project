import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature SHL-008 Settings persistence in cookies @feature SHL-074 In-panel text header @feature SHL-031 Text panel
test.describe("display settings", () => {
  test("language changes immediately and survives a reload (cookie, server-rendered)", async ({ page, context }) => {
    await open(page, "/Genesis.1");
    await expect(page.getByText("When God began to create").first()).toBeVisible();

    await page.getByRole("button", { name: "Text display options" }).click();
    await page.getByRole("radio", { name: "Source", exact: true }).click();
    await expect(page.getByText("When God began to create")).toHaveCount(0);

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "language")?.value).toBe("hebrew");

    // The reload is server-rendered from the cookie: no flash of the wrong language.
    // (The page also embeds the dehydrated query cache in a script, so look at rendered markup only.)
    const html = (await (await page.request.get("/Genesis.1")).text()).replace(/<script[\s\S]*?<\/script>/g, "");
    expect(html).not.toContain("When God began to create");
    expect(html).toContain('data-language="hebrew"');
    await page.reload();
    await expect(page.getByText("When God began to create")).toHaveCount(0);
  });

  test("the menu follows the book: Talmud offers punctuation, Torah offers aliyot", async ({ page }) => {
    await open(page, "/Genesis.1");
    await page.getByRole("button", { name: "Text display options" }).click();
    await expect(page.getByRole("switch", { name: "Aliyot" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Punctuation" })).toHaveCount(0);

    await open(page, "/Berakhot.2a");
    await page.getByRole("button", { name: "Text display options" }).click();
    await expect(page.getByRole("switch", { name: "Punctuation" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Aliyot" })).toHaveCount(0);
  });

  test("Aliyot adds aliyah headers", async ({ page }) => {
    await open(page, "/Genesis.1?lang=he");
    const headers = page.locator("[data-language] h3"); // parasha / aliyah headers inside the text, not the menu
    await expect(headers).toHaveCount(1); // parasha title only
    await page.getByRole("button", { name: "Text display options" }).click();
    await page.getByRole("switch", { name: "Aliyot" }).click();
    await expect(headers.first()).toContainText(/ראשון/);
  });

  test("font size changes the reading size and persists", async ({ page, context }) => {
    await open(page, "/Genesis.1?lang=en");
    const size = () => page.locator("[data-language]").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const before = await size();
    await page.getByRole("button", { name: "Text display options" }).click();
    await page.getByRole("button", { name: "Larger text" }).click();
    expect(await size()).toBeCloseTo(before * 1.15, 0);
    expect((await context.cookies()).find((c) => c.name === "fontSize")?.value).toBe("71.875");
    await expect(page.getByRole("dialog")).toBeVisible(); // the menu stays open on a font change
  });

  test("Escape closes the menu and returns focus to its button", async ({ page }) => {
    await open(page, "/Genesis.1");
    const button = page.getByRole("button", { name: "Text display options" });
    await button.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("Talmud is continuous by default in one language and segmented when bilingual", async ({ page }) => {
    await open(page, "/Berakhot.2a?lang=he");
    expect(await page.locator('[data-layout]').first().getAttribute("data-layout")).toBe("continuous");
    await open(page, "/Berakhot.2a?lang=bi");
    expect(await page.locator('[data-layout]').first().getAttribute("data-layout")).toBe("segmented");
  });
});
