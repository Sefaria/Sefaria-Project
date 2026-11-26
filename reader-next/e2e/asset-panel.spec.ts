import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * An asset panel (features/assets/AssetPanel.tsx): an interactive page beside a text, in a sandboxed frame, linked both ways.
 * The sample (public/assets/samples/seven-days.html) is a scroll story over Genesis 1:1–2:3; its status line names the day in view.
 */
const asset = (page: Page) => page.frameLocator('section[data-panel-kind="asset"] iframe');
const status = (page: Page) => asset(page).locator(".status");
const path = (page: Page) => decodeURIComponent(new URL(page.url()).pathname);

test.describe("asset panel", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  // @feature SHL-093 Asset panel
  test("opens beside its text in a frame with scripts only, and starts at the text's place", async ({ page }) => {
    await open(page, "/Genesis.1.14?lang=bi&a2=sample:seven-days&link=2-1");
    const frame = page.locator('section[data-panel-kind="asset"] iframe');
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    await expect(page.locator('section[data-panel-kind="asset"] h1')).toHaveText("The Seven Days");
    await expect(status(page)).toHaveText(/Day four/);
    // the page cannot reach the reader: no same-origin access from inside the frame
    const reach = await page.frames().find((f) => f !== page.mainFrame())!.evaluate(() => {
      try {
        return String(window.parent.document.title);
      } catch {
        return "blocked";
      }
    });
    expect(reach).toBe("blocked");
  });

  // @feature SHL-094 Asset protocol
  test("reading the text moves the story, and scrolling the story moves the text", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=bi&a2=sample:seven-days&link=2-1");
    await expect(status(page)).toHaveText(/Day one/);
    await page.locator('section[data-panel-id="p1"] [data-reader-scroller]').hover({ position: { x: 300, y: 400 } });
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(120);
    }
    await expect(status(page)).not.toHaveText(/Day one/);
    await page.locator('section[data-panel-kind="asset"] iframe').hover();
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
    }
    await expect(status(page)).toHaveText(/seventh day/);
    await expect.poll(() => path(page)).toMatch(/^\/Genesis\.2\.[1-3]$/);
  });

  // @feature SHL-094 Asset protocol
  test("the story's link to another text takes the text panel there, and Back returns", async ({ page }) => {
    await open(page, "/Genesis.1.14?lang=bi&a2=sample:seven-days&link=2-1");
    await expect(status(page)).toHaveText(/Day four/);
    await asset(page).getByRole("button", { name: /Psalm 104/ }).click();
    await expect.poll(() => path(page)).toBe("/Psalms.104.19");
    await page.goBack();
    await expect.poll(() => path(page)).toBe("/Genesis.1.14");
  });

  // @feature SHL-093 Asset panel
  test("a page opened from a file comes in linked, and closing the text closes it", async ({ page }) => {
    await open(page, "/Genesis.1.20?lang=bi");
    await page.getByRole("button", { name: "Text display options" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open an interactive page…" }).click();
    await (await chooser).setFiles("public/assets/samples/seven-days.html");
    await expect.poll(() => new URL(page.url()).searchParams.get("link")).toBe("2-1");
    expect(new URL(page.url()).searchParams.get("a2")).toMatch(/^local:/);
    await expect(status(page)).toHaveText(/Day five/);
    await page.locator('section[data-panel-id="p1"]').getByRole("button", { name: "Close this text" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/texts");
  });
});
