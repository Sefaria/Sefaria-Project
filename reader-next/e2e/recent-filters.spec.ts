import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature CON-028 Recent filters chips @feature SHL-051 (VERIFIED on sefaria.org 2026-11-10 at 1280px: Genesis 1:1, Commentary → Rashi
// shows "Rashi"; back → Ramban shows "Ramban Rashi", Ramban current with its rule; the set sits above the list)
test("the filters used in the sidebar show above the list, newest first; a recent one's link keeps the order", async ({ page }) => {
  await open(page, "/Genesis.1.1?lang=bi&with=Commentary%20ConnectionsList");
  const side = page.locator("aside");
  await side.locator("[data-panel-body]").getByRole("link", { name: /^Rashi\(/ }).click();
  await expect(page).toHaveURL(/with=Rashi/);
  // one filter: the title alone
  await expect(side.locator("[data-recent-filters]")).toHaveCount(0);
  await expect(side.getByRole("heading", { level: 3, name: "Rashi" })).toBeVisible();
  await side.getByRole("link", { name: "Commentary" }).first().click();
  await side.locator("[data-panel-body]").getByRole("link", { name: /^Ramban\(/ }).click();
  await expect(page).toHaveURL(/with=Ramban/);
  const set = side.locator("[data-recent-filters]");
  await expect(set).toHaveText(/^Ramban\s*Rashi$/, { timeout: 15_000 });
  await expect(set.locator('[aria-current="true"]')).toHaveText("Ramban");
  await set.getByRole("link", { name: "Rashi" }).click();
  await expect(page).toHaveURL(/with=Rashi/);
  await expect(set).toHaveText(/^Ramban\s*Rashi$/);
  await expect(set.locator('[aria-current="true"]')).toHaveText("Rashi");
});

// @feature CON-002 Phone header: Resources' title is centred (VERIFIED on sefaria.org 2026-11-10, Pixel 7: justify-content center on
// Resources, flex-start elsewhere); at desktop width it starts the bar
test("on a phone-width screen the Resources title is centred; on desktop it is not", async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await open(page, "/Genesis.1.1?lang=bi&with=all");
  const title = page.locator("aside h2").first();
  await expect(title).toHaveText(/Resources/i, { timeout: 25_000 });
  await expect(title).toHaveCSS("text-align", "center");
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(title).not.toHaveCSS("text-align", "center");
});
