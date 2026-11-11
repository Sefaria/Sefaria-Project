import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * WCAG 1.4.10 Reflow (v-a11y S8): no horizontal page scroll at 320 CSS px wide, and at 1280px zoomed to 200% (640 CSS px). The
 * elements that stick out are named in the failure, so a regression says where it is.
 */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && (r.right > w + 1 || r.left < -1)) || e.closest("[aria-hidden='true'], [hidden]") || getComputedStyle(e).position === "fixed") return false;
        // inside its own scroller (a row that scrolls sideways) it is clipped, not on the page
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return false;
        return true;
      })
      .filter((e, _, all) => !all.some((p) => p !== e && p.contains(e)))
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}.${e.className} [${Math.round(e.getBoundingClientRect().left)}, ${Math.round(e.getBoundingClientRect().right)}]`);
    return { scroll: document.scrollingElement!.scrollWidth, width: w, out };
  });
}
const hebrew = (page: Page) => page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);

// @feature TOP-003 @feature TOP-005 @feature LIB-022
test.describe("reflow", () => {
  test("/topics in Hebrew at 320px: no horizontal page scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await hebrew(page);
    await open(page, "/topics");
    await page.waitForLoadState("networkidle");
    const o = await overflow(page);
    expect(o.scroll, o.out.join("\n")).toBeLessThanOrEqual(o.width);
  });
  for (const lang of ["english", "hebrew"] as const) {
    test(`/updates at 640px (1280 zoomed to 200%), ${lang}: no horizontal page scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 640, height: 450 });
      if (lang === "hebrew") await hebrew(page);
      await open(page, "/updates");
      await page.waitForLoadState("networkidle");
      const o = await overflow(page);
      expect(o.scroll, o.out.join("\n")).toBeLessThanOrEqual(o.width);
    });
  }
});
