import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature TXD-001 @feature TXD-058
test("copying Genesis 1:1-3 puts clean text on the clipboard, as sefaria.org does", async ({ page }) => {
  await open(page, "/Genesis.1?lang=bi");
  await expect(page.locator('[role="group"][data-ref="Genesis 1:3"]')).toBeVisible({ timeout: 25_000 });
  const got = await page.evaluate(() => {
    const segs = [...document.querySelectorAll('[role="group"][data-ref]')].slice(0, 3);
    const r = document.createRange();
    r.setStartBefore(segs[0]!);
    r.setEndAfter(segs[2]!);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    let data: { html: string; text: string } | null = null;
    window.addEventListener("copy", (e) => { data = { html: e.clipboardData!.getData("text/html"), text: e.clipboardData!.getData("text/plain") }; });
    document.execCommand("copy");
    return data;
  });
  expect(got).not.toBeNull();
  const lines = got!.text.split("\n");
  expect(lines).toHaveLength(6); // Hebrew and English for each of three verses
  expect(lines[0]!.replace(/[\u0591-\u05C7]/g, "")).toBe("בראשית ברא אלהים את השמים ואת הארץ");
  expect(lines[1]).toBe("When God began to create heaven and earth—");
  expect(got!.text).not.toMatch(/connections available|^\d/m);
  expect(got!.html).toContain('<div dir="rtl">');
  expect(got!.html).not.toContain("<a ");
});
