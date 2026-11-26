import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * Linked panels (features/workspace/links.tsx): a commentary or targum opened as its own panel follows its text, and the text follows it.
 * The `linked_panels` lab is on for the e2e dev server (playwright.config.ts).
 */
const panel = (page: Page, id: string) => page.locator(`section[data-panel-id="${id}"]`);
const current = (page: Page, id: string) => panel(page, id).locator('[role="group"][data-focused="true"], [role="group"][aria-current="true"]').first().getAttribute("data-ref");
async function readIn(page: Page, id: string, dy: number, steps = 3) {
  await panel(page, id).locator("[data-reader-scroller]").hover();
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(120);
  }
}

test.describe("linked panels", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  // @feature SHL-092 Opening a commentary, targum or version links it
  test("opening Rashi from the sidebar opens it linked, with the link symbol between the panels", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=bi&with=Rashi&lang2=en");
    await page.getByText("Open", { exact: true }).first().click();
    await expect(panel(page, "p2")).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("link")).toBe("2-1");
    const symbol = page.getByRole("button", { name: "Unlink from Genesis" });
    await expect(symbol).toBeVisible();
    await expect(symbol).toHaveAttribute("aria-pressed", "true");
  });

  // @feature SHL-090 Linked panels
  test("reading on in the text moves the commentary to its comment, and reading the commentary moves the text", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=bi&p2=Rashi_on_Genesis.1.1.1&lang2=bi&link=2-1");
    const entries = await page.evaluate(() => history.length);
    await readIn(page, "p1", 300);
    await expect.poll(async () => {
      const p1 = await current(page, "p1");
      const p2 = await current(page, "p2");
      return p1 && p2 ? p2.startsWith(`Rashi on ${p1}:`) : false;
    }).toBe(true);
    await readIn(page, "p2", 500);
    await expect.poll(async () => {
      const p1 = await current(page, "p1");
      const p2 = (await current(page, "p2")) ?? "";
      return p1 !== null && p2.startsWith(`Rashi on ${p1}:`);
    }).toBe(true);
    // following never adds history entries (each move replaces)
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  // @feature SHL-091 Link symbol (pause and link again)
  test("the symbol pauses the link, and linking again brings the commentary to the text", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=bi&p2=Rashi_on_Genesis.1.1.1&lang2=bi&link=2-1");
    await page.getByRole("button", { name: "Unlink from Genesis" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("link")).toBe("2-1~");
    const relink = page.getByRole("button", { name: "Link to Genesis again" });
    await expect(relink).toHaveAttribute("aria-pressed", "false");
    const rashiBefore = await current(page, "p2");
    await readIn(page, "p1", 400, 4);
    await page.waitForTimeout(600);
    expect(await current(page, "p2")).toBe(rashiBefore); // paused: the commentary stays
    await relink.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("link")).toBe("2-1");
    await expect.poll(async () => {
      const p1 = await current(page, "p1");
      const p2 = (await current(page, "p2")) ?? "";
      return p1 !== null && p2 !== rashiBefore && p2.startsWith("Rashi on Genesis 1:");
    }).toBe(true);
  });

  // @feature SHL-090 Linked panels
  test("a targum follows verse for verse", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=bi&p2=Onkelos_Genesis.1.1&lang2=bi&link=2-1");
    await readIn(page, "p2", 300);
    await expect.poll(async () => {
      const p1 = await current(page, "p1");
      const p2 = await current(page, "p2");
      return p1 !== null && p2 === `Onkelos ${p1}`;
    }).toBe(true);
  });
});
