import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// sefaria.org shows Hebrew and English side by side only in a panel wider than 500px (ReaderPanel.currentLayout); a narrower panel, a
// phone included, is stacked whatever the reader chose. Measured on www.sefaria.org (2026-11-12): two panels in a 1000px window are 500px
// each and stacked, in a 1010px window 505px and side by side; a Pixel 7 is stacked.
const layout = (page: Page, biLayout: "heLeft" | "heRight") =>
  page.context().addCookies([{ name: "biLayout", value: biLayout, domain: "localhost", path: "/" }]);

/** Whether Genesis 1:1 (first panel) shows its two sides on one row, and the panel's width. */
async function arrangement(page: Page) {
  const seg = page.locator('[role="group"][data-ref="Genesis 1:1"]').first();
  await expect(seg.locator('[data-side="translation"]')).toBeVisible({ timeout: 25_000 });
  return seg.evaluate((s) => {
    const he = s.querySelector('[data-side="primary"]')!.getBoundingClientRect();
    const en = s.querySelector('[data-side="translation"]')!.getBoundingClientRect();
    // the panel's outer box, scrollbar included, as sefaria.org measures it (a classic scrollbar, as on Linux CI, is 15px of it)
    const frame = s.closest<HTMLElement>("[data-reader-frame]")!;
    return {
      sideBySide: Math.abs(he.top - en.top) < 2,
      panel: frame.getBoundingClientRect().width,
      overlap: he.right > en.left && en.right > he.left && he.bottom > en.top && en.bottom > he.top,
    };
  });
}

for (const biLayout of ["heLeft", "heRight"] as const) {
  // @feature TXD-043
  test(`${biLayout}: two panels of 500px are stacked, of 505px side by side`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
    await layout(page, biLayout);
    await page.setViewportSize({ width: 1000, height: 900 });
    await open(page, "/Genesis.1?lang=bi&p2=Exodus.1&lang2=bi");
    const narrow = await arrangement(page);
    expect(narrow.panel).toBeLessThanOrEqual(500);
    expect(narrow.sideBySide).toBe(false);
    expect(narrow.overlap).toBe(false);
    await page.setViewportSize({ width: 1010, height: 900 });
    await expect.poll(async () => (await arrangement(page)).sideBySide).toBe(true);
    expect((await arrangement(page)).panel).toBeGreaterThan(500);
  });

  // @feature TXD-043
  test(`${biLayout}: a phone is stacked @mobile`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
    await layout(page, biLayout);
    await open(page, "/Genesis.1?lang=bi");
    const phone = await arrangement(page);
    expect(phone.sideBySide).toBe(false);
    expect(phone.overlap).toBe(false);
  });
}

// The display menu offers no layout choice for a bilingual panel 600px wide or less (sefaria.org ReaderDisplayOptionsMenu
// showLayoutsToggle: `width <= 600 && bilingual`). Measured on www.sefaria.org: Pixel 7 and two panels at 1100px (550 each) have no
// layout row; one panel at 1280px has it. Without this a phone could write a side-by-side setting that changes the desktop.
async function layoutOffered(page: Page) {
  await page.getByRole("button", { name: "Text display options" }).first().click();
  await expect(page.getByText("Font Size").first()).toBeVisible();
  return page.getByRole("radiogroup", { name: "text layout toggle" }).count();
}

// @feature TXD-043
test("menu: one wide panel offers the layout; two 550px panels do not", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
  await open(page, "/Genesis.1?lang=bi");
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"] [data-side="translation"]')).toBeVisible({ timeout: 25_000 });
  expect(await layoutOffered(page)).toBe(1);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1100, height: 900 });
  await open(page, "/Genesis.1?lang=bi&p2=Exodus.1&lang2=bi");
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"] [data-side="translation"]')).toBeVisible({ timeout: 25_000 });
  expect(await layoutOffered(page)).toBe(0);
});

// @feature TXD-043
test("menu: a phone offers no layout in bilingual @mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
  await open(page, "/Genesis.1?lang=bi");
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"] [data-side="translation"]')).toBeVisible({ timeout: 25_000 });
  expect(await layoutOffered(page)).toBe(0);
});

// A classic scrollbar (Windows, Linux, macOS "always show") takes 15px out of the scroller but not out of sefaria.org's panel width:
// two panels in a 1010px window are 505px there with or without it, and side by side. Measured on www.sefaria.org with
// `::-webkit-scrollbar { width: 15px }` forced on both sites: 1010-1030px side by side, 1000px stacked.
for (const width of [1010, 1030]) {
  // @feature TXD-043
  test(`classic 15px scrollbar: two panels in a ${width}px window stay side by side`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
    await layout(page, "heLeft");
    await page.setViewportSize({ width, height: 900 });
    await open(page, "/Genesis.1?lang=bi&p2=Exodus.1&lang2=bi");
    await page.addStyleTag({ content: "::-webkit-scrollbar { width: 15px; height: 15px; } ::-webkit-scrollbar-thumb { background: #888; }" });
    const scrollbar = await page.locator("[data-reader-scroller]").first().evaluate((e) => (e as HTMLElement).offsetWidth - (e as HTMLElement).clientWidth);
    expect(scrollbar).toBe(15);
    await expect.poll(async () => (await arrangement(page)).sideBySide).toBe(true);
  });
}

// @feature TXD-043
test("classic 15px scrollbar: two panels in a 1000px window are stacked", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
  await layout(page, "heLeft");
  await page.setViewportSize({ width: 1000, height: 900 });
  await open(page, "/Genesis.1?lang=bi&p2=Exodus.1&lang2=bi");
  await page.addStyleTag({ content: "::-webkit-scrollbar { width: 15px; height: 15px; } ::-webkit-scrollbar-thumb { background: #888; }" });
  await expect.poll(async () => (await arrangement(page)).sideBySide).toBe(false);
});
