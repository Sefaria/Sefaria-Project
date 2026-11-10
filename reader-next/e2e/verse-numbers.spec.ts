import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const numberStyle = (page: import("@playwright/test").Page, ref: string) =>
  page.locator(`[role="group"][data-ref="${ref}"] [data-number]`).evaluate((n) => {
    const cs = getComputedStyle(n);
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

  await open(page, "/Genesis.1?lang=en");
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"] [data-number]')).toHaveText("1", { timeout: 25_000 });
  const en = await numberStyle(page, "Genesis 1:1");
  expect(en.size).toBe("12px");
  expect(en.family).toMatch(/^"?Roboto/);
});

// @feature TXD-010 Zohar's paragraph numbers run on across sections (index_offsets_by_depth). VERIFIED on sefaria.org 2026-11-10:
// /Zohar,_Bereshit.2 opens at paragraph 3 (Zohar, Bereshit 2:3), numbered 3, 4, 5...
test("Zohar: a section's paragraphs are numbered on from the one before", async ({ page }) => {
  await open(page, "/Zohar,_Bereshit.2?lang=bi");
  const first = page.locator('[role="group"][data-ref^="Zohar, Bereshit 2:"]').first();
  await expect(first).toHaveAttribute("data-ref", "Zohar, Bereshit 2:3", { timeout: 25_000 });
  await expect(first.locator("[data-number]")).toHaveText("3");
  await expect(page.locator('[role="group"][data-ref="Zohar, Bereshit 2:1"]')).toHaveCount(0);
});
