import { expect, test } from "@playwright/test";
import { focused, open, segmentTop, wheel } from "./helpers";

/** "/Genesis.1.7?lang=en" → "Genesis 1:7" */
const refOfPath = (url: string) => {
  const parts = new URL(url).pathname.slice(1).split(".");
  return `${parts[0]!.replace(/_/g, " ")} ${parts.slice(1).join(":")}`;
};

// @feature SHL-064 @feature SHL-065 @feature RTE-055
test.describe("back and forward", () => {
  test("put the reader back where they were, close the sidebar, and don't jump", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en");
    await wheel(page, 300, 3);
    await expect.poll(() => new URL(page.url()).pathname).not.toBe("/Genesis.1.1");
    await page.waitForTimeout(300);
    const pathA = new URL(page.url()).pathname;
    const refA = refOfPath(page.url());
    const topA = await segmentTop(page, refA);

    // Choose a verse a little further down: opens the sidebar and adds a history entry.
    const next = `${refA.split(":")[0]}:${Number(refA.split(":")[1]) + 3}`;
    const box = await page.locator(`[role="group"][data-ref="${next}"]`).boundingBox();
    await page.mouse.click(box!.x + 80, box!.y + 10);
    await expect(page).toHaveURL(/with=all/);
    await expect(page.getByRole("complementary")).toBeVisible();

    // Read on with the sidebar open.
    await wheel(page, 300, 2);
    await expect.poll(() => new URL(page.url()).pathname).not.toBe(new URL(page.url()).pathname + "x");
    await page.waitForTimeout(400);
    const refB = refOfPath(page.url());
    const topB = await segmentTop(page, refB);

    await page.goBack();
    await expect(page).not.toHaveURL(/with=/);
    await expect(page.getByRole("complementary")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(pathA);
    await page.waitForTimeout(500);
    expect(Math.abs((await segmentTop(page, refA)) - topA)).toBeLessThan(2);

    await page.goForward();
    await expect(page).toHaveURL(/with=all/);
    await expect(page.getByRole("complementary")).toBeVisible();
    await page.waitForTimeout(500);
    expect(Math.abs((await segmentTop(page, refB)) - topB)).toBeLessThan(2);
    expect(await focused(page)).toBe(refB); // the highlight is on the verse they were reading
  });

  // "Open" replaces the sidebar with a new panel (CON-033, VERIFIED on sefaria.org); Back puts the sidebar back
  test("Open from the sidebar adds a panel; Back restores the text with its sidebar", async ({ page }) => {
    await open(page, "/Genesis.1.1?lang=en&with=Rashi");
    // Choose verse 2 first, so the entry we come back to was made by a selection (not a fresh page load).
    const box = await page.locator('[role="group"][data-ref="Genesis 1:2"]').boundingBox();
    await page.mouse.click(box!.x + 80, box!.y + 10);
    await expect(page).toHaveURL(/\/Genesis\.1\.2\?.*with=Rashi/);
    const item = page.getByRole("complementary").locator("li[data-ref]").first();
    await expect(item).toHaveAttribute("data-ref", /Rashi on Genesis 1:2:/, { timeout: 30_000 });
    await item.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/Genesis\.1\.2\?lang=en&aliyot=0&p2=Rashi_on_Genesis\.1\.2\.\d+&lang2=en$/);
    await expect(page.locator('section[data-panel-id="p2"] [role="group"][data-ref^="Rashi on Genesis 1:2:"]').first()).toBeVisible();
    await expect(page.getByRole("complementary")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/Genesis\.1\.2\?.*with=Rashi/);
    await expect(page.locator('[role="group"][data-ref="Genesis 1:2"]')).toBeVisible();
    await expect(page.locator("section[data-panel-id]")).toHaveCount(1);
  });
});
