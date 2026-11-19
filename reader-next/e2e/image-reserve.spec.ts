import { expect, test, type Route } from "@playwright/test";
import { open, segmentTop, wheel } from "./helpers";

const IMG = "https://textimages.sefaria.org/e2e/reserve-test.svg";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#7c98b6"/></svg>`;

// @feature TXD-026 @feature TXD-068 An image in the text keeps its box before it loads (its stored width/height), so one that arrives
// above where the reader is reading does not move the text (no reliance on anchor correction)
test("an image loading above the reading place does not move the verse being read", async ({ page }) => {
  // the section above the one opened gets an inline image with a stored size (the texts the browser fetches; the page's own are
  // server-rendered); the image is held until the reader has settled
  let injected = false;
  await page.route("**/api/v3/texts/**", async (r) => {
    const url = decodeURIComponent(r.request().url());
    if (!/\/api\/v3\/texts\/Genesis[ .]1(\?|$)/.test(url)) return r.continue();
    const res = await r.fetch();
    const body = await res.json();
    for (const v of body.versions ?? []) {
      if (Array.isArray(v.text) && typeof v.text[29] === "string" && v.text[29]) {
        v.text[29] = `${v.text[29]} <img src="${IMG}" alt="test figure" width="400" height="300">`;
        injected = true;
      }
    }
    await r.fulfill({ response: res, json: body });
  });
  const held: Route[] = [];
  await page.route(IMG, (r) => void held.push(r));

  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/Genesis.2.3?lang=en");
  await expect(page.locator('[role="group"][data-ref="Genesis 2:3"]')).toBeVisible({ timeout: 25_000 });
  // read up a little until the chapter above is there (prefetched, or loaded as the reader nears it)
  const img = page.locator(`[role="group"][data-ref="Genesis 1:30"] img`);
  for (let i = 0; i < 8 && !(await img.count()); i++) {
    await wheel(page, -150);
    await page.waitForTimeout(600);
  }
  await expect(img).toHaveCount(1, { timeout: 20_000 });
  expect(injected).toBe(true);
  // its box is reserved before a byte of it has arrived
  expect(await img.evaluate((e) => (e as HTMLImageElement).complete)).toBe(false);
  expect(await img.evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBeGreaterThan(100);
  // the reader is below the image: the verse at the top of the screen is the one to hold still
  const readRef = await page.evaluate(() => {
    const groups = [...document.querySelectorAll<HTMLElement>('[role="group"][data-ref]')];
    return groups.find((g) => g.getBoundingClientRect().top > 200)!.dataset.ref!;
  });
  expect(readRef.startsWith("Genesis 2") || readRef === "Genesis 1:31").toBe(true);
  await page.waitForTimeout(800);
  const before = await segmentTop(page, readRef);
  await expect.poll(() => held.length, { timeout: 10_000 }).toBeGreaterThan(0);
  for (const r of held) await r.fulfill({ contentType: "image/svg+xml", body: SVG });
  await expect.poll(() => img.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(300);
  expect(Math.abs((await segmentTop(page, readRef)) - before)).toBeLessThanOrEqual(1);
});
