import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// Keyboard and screen-reader behaviour of the reading panel (wave-3 a11y report v-a11y.md, S1 S2 S3 S5 S9).
const verse = (page: Page, ref: string) => page.locator(`[role="group"][data-ref="${ref}"]`);
const aside = (page: Page) => page.locator("section[data-panel-id] aside").first();
const activeRef = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[role="group"][data-ref]')?.dataset.ref ?? document.activeElement?.tagName);

// @feature SHL-071 @feature SHL-033
test.describe("Escape with the sidebar open closes the sidebar only (a11y S1)", () => {
  test("from a control in the sidebar: the reader keeps its place, focus goes back to the verse (S2)", async ({ page }) => {
    await open(page, "/Genesis.1.2?lang=bi&with=all");
    const control = aside(page).getByRole("link").or(aside(page).getByRole("button")).first();
    await control.focus();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/Genesis\.1\.2\?/);
    await expect(page).not.toHaveURL(/with=/);
    await expect(page.locator("aside")).toHaveCount(0);
    await expect.poll(() => activeRef(page)).toBe("Genesis 1:2");
  });

  test("from the verse chosen with Enter: the sidebar closes, the reader stays on Genesis 1", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await verse(page, "Genesis 1:3").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/with=all/);
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/with=/);
    await expect(page).toHaveURL(/\/Genesis\.1\.3\?/);
    await expect(verse(page, "Genesis 1:3")).toBeFocused();
    // with no sidebar, Escape closes the panel as before (shared with legacy)
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/texts$/);
  });
});

// @feature SHL-033 @feature I18-003
test("the sidebar's Close button returns keyboard focus to the verse it was open on (a11y S2)", async ({ page }) => {
  await open(page, "/Genesis.1.2?lang=bi&with=all");
  await aside(page).getByRole("button", { name: "Close" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("aside")).toHaveCount(0);
  await expect.poll(() => activeRef(page)).toBe("Genesis 1:2");
});

// @feature SHL-031 @feature I18-005
test("a polite live region names the section the reader moved into, once, not on arrival (a11y S3)", async ({ page }) => {
  await open(page, "/Genesis.1?lang=bi");
  const region = page.getByTestId("reader-announcer");
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveText("");
  // read on into chapter 2 (the reader's own scrolling)
  const box = (await page.locator("[data-reader-scroller]").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 300);
  for (let i = 0; i < 40 && !(await page.locator('section[data-ref="Genesis 2"]').isVisible().catch(() => false)); i++) await page.mouse.wheel(0, 900);
  await expect(verse(page, "Genesis 2:1")).toBeAttached();
  await verse(page, "Genesis 2:1").scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 10);
  await expect(region).toHaveText("Genesis 2", { timeout: 15_000 });
});

// @feature SHL-017 @feature I18-004
test("Tab stays inside the Text display options menu; Escape closes it and returns focus (a11y S9)", async ({ page }) => {
  await open(page, "/Genesis.1?lang=bi");
  const trigger = page.getByRole("button", { name: "Text display options" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Text display options" });
  await expect(menu).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(await menu.evaluate((m) => m.contains(document.activeElement)), `Tab ${i + 1} left the menu`).toBe(true);
  }
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await menu.evaluate((m) => m.contains(document.activeElement)), `Shift+Tab ${i + 1} left the menu`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

// @feature I18-013 @feature I18-005
test("Hebrew interface: the panel's controls and its verses have Hebrew accessible names (a11y S5)", async ({ page }) => {
  await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
  await open(page, "/Genesis.1?lang=bi");
  await expect(page.getByRole("button", { name: "אפשרויות תצוגת טקסט" })).toBeVisible();
  await expect(page.getByRole("button", { name: "חזרה לספריה" })).toBeAttached();
  await expect(page.getByRole("button", { name: 'שמירת "בראשית א׳"' })).toBeAttached();
  await expect(page.getByRole("region", { name: "בראשית א׳" })).toBeAttached();
  await expect(page.getByRole("group", { name: "בראשית א׳:ג׳" })).toBeAttached();
  await expect(page.getByRole("button", { name: "Text display options" })).toHaveCount(0);
});
