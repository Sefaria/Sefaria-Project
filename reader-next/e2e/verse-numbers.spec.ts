import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const numberStyle = (page: import("@playwright/test").Page, ref: string) =>
  page.locator(`[role="group"][data-ref="${ref}"] [data-number]`).evaluate((n) => {
    // the glyphs are in the inner span; the outer box has the first line's metrics, so the number sits on its baseline
    const cs = getComputedStyle(n.firstElementChild ?? n);
    return { text: n.textContent, size: cs.fontSize, family: cs.fontFamily, weight: cs.fontWeight };
  });

// @feature TXD-045 Verse numbers: legacy's size (12px, VERIFIED on sefaria.org 2026-11-10), Hebrew numerals in Heebo, Arabic in Roboto
test("verse numbers are legacy's 12px; Hebrew numerals are set in the Hebrew UI face", async ({ page }) => {
  await open(page, "/Genesis.1?lang=he");
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"] [data-number]')).toHaveText("א", { timeout: 25_000 });
  const he = await numberStyle(page, "Genesis 1:1");
  expect(he.size).toBe("12px");
  expect(he.family).toMatch(/^"?Heebo/);
  expect(Number(he.weight)).toBeGreaterThanOrEqual(400); // legacy's `lighter` is not ported: the thin face is what is hard to read
  // Heebo 400 (Hebrew) is preloaded with the page: the numbers are set in it from the first paint
  await expect(page.locator('head link[rel="preload"][as="font"][href*="heebo-hebrew-400-normal"]')).toHaveCount(1);

  await open(page, "/Genesis.1?lang=en");
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"] [data-number]')).toHaveText("1", { timeout: 25_000 });
  const en = await numberStyle(page, "Genesis 1:1");
  expect(en.size).toBe("12px");
  expect(en.family).toMatch(/^"?Roboto/);
});

// How far a verse's number sits from its first line, baseline to baseline (0 when it sits on the line), for the first few verses
const numberOffsets = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const baselineAt = (node: Node) => {
      const r = document.createRange();
      r.setStart(node, 0);
      r.collapse(true);
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      r.insertNode(probe);
      const y = probe.getBoundingClientRect().top;
      const parent = probe.parentNode!;
      probe.remove();
      parent.normalize();
      return y;
    };
    const firstText = (el: Element) => document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent!.trim() ? 1 : 3) }).nextNode()!;
    return [...document.querySelectorAll('[role="group"][data-ref]')].slice(0, 4).map((seg) => {
      const num = seg.querySelector("[data-number]")!;
      const side = seg.querySelector("[data-side]")!;
      return Math.abs(baselineAt(firstText(num)) - baselineAt(firstText(side)));
    });
  });

// @feature TXD-045 A verse's number sits on the baseline of its first line (the designers' review, 2026-11-22: it sat 16px above it
// in English, as a 12px box with its own line height; legacy's sits a little high too)
for (const lang of ["en", "he", "bi"]) {
  test(`verse numbers sit on their first line's baseline, ${lang}`, async ({ page }) => {
    await open(page, `/Genesis.1?lang=${lang}`);
    await expect(page.locator('[role="group"][data-ref="Genesis 1:1"] [data-number]')).toBeVisible({ timeout: 25_000 });
    for (const d of await numberOffsets(page)) expect(d).toBeLessThan(0.5);
  });
}

// @feature TXD-010 Zohar's paragraph numbers run on across sections (index_offsets_by_depth). VERIFIED on sefaria.org 2026-11-10:
// /Zohar,_Bereshit.2 opens at paragraph 3 (Zohar, Bereshit 2:3), numbered 3, 4, 5...
test("Zohar: a section's paragraphs are numbered on from the one before", async ({ page }) => {
  await open(page, "/Zohar,_Bereshit.2?lang=bi");
  const first = page.locator('[role="group"][data-ref^="Zohar, Bereshit 2:"]').first();
  await expect(first).toHaveAttribute("data-ref", "Zohar, Bereshit 2:3", { timeout: 25_000 });
  await expect(first.locator("[data-number]")).toHaveText("3");
  await expect(page.locator('[role="group"][data-ref="Zohar, Bereshit 2:1"]')).toHaveCount(0);
});
