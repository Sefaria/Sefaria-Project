import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature TXD-046 @feature TXD-047
test("continuous Talmud: each number sits in the gutter at its segment's first line; numbers that share a line step apart", async ({ page }) => {
  await open(page, "/Berakhot.2a?lang=he");
  await expect(page.locator('[role="group"][data-ref="Berakhot 2a:6"]')).toBeVisible({ timeout: 25_000 });
  const rects = await page.evaluate(() =>
    [...document.querySelectorAll('[role="group"][data-ref]')].slice(0, 8).map((s) => {
      const n = s.querySelector("[data-number]")!.getBoundingClientRect();
      return { left: Math.round(n.left), top: Math.round(n.top), text: s.querySelector("[data-number]")!.textContent };
    }),
  );
  const textRight = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[role="group"] p')].slice(0, 8).map((p) => p.getBoundingClientRect().right)));
  for (const r of rects) expect(r.left).toBeGreaterThanOrEqual(textRight - 1); // in the gutter, right of the text (Hebrew)
  // two numbers on one line never share a place
  const seen = new Set<string>();
  for (const r of rects) {
    const key = `${r.left}/${r.top}`;
    expect(seen.has(key), `numbers overlap at ${key}`).toBe(false);
    seen.add(key);
  }
  // the third and fourth segments begin on one line in this tractate: they are on the same top and apart
  const same = rects.filter((r, i) => rects.some((o, j) => j !== i && o.top === r.top));
  expect(same.length).toBeGreaterThanOrEqual(2);
});
