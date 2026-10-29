import { expect, test } from "@playwright/test";
import { focused, open, sectionRefs, segmentTop, wheel } from "./helpers";
for (const delay of [800, 1500, 2500]) {
  test(`windowing with slow texts ${delay}ms`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.route("**/api/v3/texts/**", async (r) => { await new Promise((x) => setTimeout(x, delay)); await r.continue(); });
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, "/Psalms.1.1?lang=bi&with=all");
    for (let i = 0; i < 25; i++) { await wheel(page, 900, 2); await page.waitForTimeout(120); }
    const samples: string[] = [];
    let ref = await focused(page);
    let top = await segmentTop(page, ref!);
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(500);
      const n = (await sectionRefs(page)).length;
      const t = await segmentTop(page, ref!).catch(() => NaN);
      samples.push(`${n}:${Math.round(t - top)}`);
    }
    console.log(`${delay}ms ref ${ref}`, samples.join(" "));
  });
}
