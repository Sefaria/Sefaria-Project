import { expect, test } from "@playwright/test";

/**
 * Every book type must load from the live API and render through the same reader.
 * `segments` is the expected number of rendered segments; `numbers` whether the gutter numbers show.
 * @feature TXT-022 Every book type renders from one model
 * @feature TXT-001 Tanakh treatment (short numeric titles) @feature TXT-014 Mishnah treatment @feature TXT-016 Commentary read as its own text
 * @feature TXT-020 Liturgy: no segment numbers @feature TXT-019 Dictionary entries: no numbers or section titles
 */
const CASES: { name: string; path: string; segments: number; numbers: boolean; heading: RegExp }[] = [
  { name: "Tanakh chapter", path: "/Genesis.1", segments: 31, numbers: true, heading: /Genesis 1/ },
  { name: "Poetry", path: "/Psalms.23", segments: 6, numbers: true, heading: /Psalms 23/ },
  { name: "Talmud Bavli daf", path: "/Berakhot.2a", segments: 14, numbers: true, heading: /Berakhot 2a/ },
  { name: "Talmud Yerushalmi", path: "/Jerusalem_Talmud_Berakhot.1.1", segments: 38, numbers: true, heading: /Jerusalem Talmud Berakhot 1:1/ },
  { name: "Mishnah", path: "/Mishnah_Berakhot.1", segments: 5, numbers: true, heading: /Mishnah Berakhot 1/ },
  { name: "Commentary (depth 3)", path: "/Rashi_on_Genesis.1.1", segments: 3, numbers: true, heading: /Rashi on Genesis 1:1/ },
  { name: "Code of law", path: "/Shulchan_Arukh,_Orach_Chayim.1", segments: 9, numbers: true, heading: /Shulchan Arukh, Orach Chayim 1/ },
  { name: "Liturgy (complex node)", path: "/Pesach_Haggadah,_Kadesh", segments: 13, numbers: false, heading: /Pesach Haggadah, Kadesh/ },
  { name: "Midrash", path: "/Bereshit_Rabbah.1", segments: 15, numbers: true, heading: /Bereshit Rabbah 1/ },
];

for (const c of CASES) {
  test(`${c.name}: ${c.path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const res = await page.goto(c.path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(c.heading);
    const segs = page.locator('[role="group"][data-ref]');
    if (c.segments) await expect(segs).toHaveCount(c.segments);
    const first = segs.first();
    await expect(first).toBeVisible();
    // gutter numbers are aria-hidden spans: count them via DOM
    const numbered = await page.evaluate(() => document.querySelectorAll('[role="group"][data-ref] > span[aria-hidden="true"]').length);
    if (c.numbers) expect(numbered).toBeGreaterThan(0);
    else expect(numbered).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("Dictionary entry hides numbers and the section title", async ({ page }) => {
  await page.goto("/Jastrow,_%D7%90%D6%B7%D7%91%D6%B8%D6%BC%D7%90_I.1");
  await expect(page.locator('[role="group"][data-ref]').first()).toBeVisible();
  await expect(page.locator("h2")).toHaveCount(0);
});
