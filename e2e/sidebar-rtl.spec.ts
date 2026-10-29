import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * Hebrew in the sidebar lays out right-to-left, wherever it appears (titles, rows, descriptions, connected texts), in both sidebar
 * languages: an element whose own text is mostly Hebrew must compute `direction: rtl`. LangText / ContentText (src/ui/LangText) set
 * lang and dir together; anything rendered around them shows up here.
 */
async function ltrHebrew(page: Page, root = "aside"): Promise<string[]> {
  return page.evaluate((root) => {
    const aside = document.querySelector(root);
    if (!aside) return ["no sidebar"];
    const out: string[] = [];
    const walker = document.createTreeWalker(aside, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      const he = (text.match(/[֐-׿]/g) ?? []).length;
      const latin = (text.match(/[A-Za-z]/g) ?? []).length;
      if (he < 2 || he < latin) continue;
      const el = n.parentElement!;
      // the block that lays the line out: the nearest ancestor that is not inline
      let block: Element = el;
      while (block.parentElement && getComputedStyle(block).display.startsWith("inline")) block = block.parentElement;
      if (seen.has(block)) continue;
      seen.add(block);
      // judged by the whole block: a Hebrew citation inside an English paragraph is English
      const all = block.textContent ?? "";
      if ((all.match(/[\u0590-\u05FF]/g) ?? []).length < (all.match(/[A-Za-z]/g) ?? []).length) continue;
      const label = `<${block.tagName.toLowerCase()} class="${block.className}">${text.trim().slice(0, 40)}`;
      // an inline run with its own dir="rtl" (a title link in a centred heading) is laid out right-to-left inside the line
      const ownDir = el.closest("[dir]");
      const isolated = ownDir && block.contains(ownDir) && ownDir !== block && ownDir.getAttribute("dir") === "rtl";
      if (getComputedStyle(block).direction !== "rtl" && !isolated) {
        out.push(label);
        continue;
      }
      // and the line sits on the right: a Hebrew title in a left-to-right row (or text-align: left) still reads from the left edge
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      const box = aside.getBoundingClientRect();
      if (isolated || getComputedStyle(block).textAlign === "center") continue;
      if (r.width && r.width < box.width * 0.6 && r.left - box.left < box.right - r.right) out.push(`left-aligned ${label}`);
    }
    return out;
  }, root);
}

const VIEWS = [
  "with=Topics&psalm",
  "with=all",
  "with=Commentary",
  "with=Rashi",
  "with=Commentary%20ConnectionsList",
  "with=Topics",
  "with=About",
  "with=Translations",
  "with=WebPages",
  "with=Torah%20Readings",
  "with=Lexicon",
  "with=Navigation",
];

// @feature CON-032 @feature CON-070
test.describe("Hebrew in the sidebar is right-to-left", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  for (const lang2 of ["he", "en"]) {
    for (const view of VIEWS) {
      test(`${view} (lang2=${lang2})`, async ({ page }) => {
        // Psalms 23 has topics recorded; Genesis 6:9 has the rest
        const path = view.endsWith("&psalm") ? `/Psalms.23.1?lang=bi&with=Topics&lang2=${lang2}` : `/Genesis.6.9?lang=bi&${view}&lang2=${lang2}`;
        await open(page, path);
        await page.waitForTimeout(1500);
        expect(await ltrHebrew(page)).toEqual([]);
      });
    }
  }
});

// the reader itself: section titles, the header, verse text — in Hebrew, and in both sides of a bilingual layout
test.describe("Hebrew in the reader is right-to-left", () => {
  test.use({ viewport: { width: 1400, height: 900 } });
  for (const path of ["/Genesis.6?lang=he", "/Genesis.6?lang=bi", "/Berakhot.2a?lang=he", "/Psalms.23?lang=he&with=all&lang2=he"]) {
    test(path, async ({ page }) => {
      await open(page, path);
      await page.waitForTimeout(1500);
      expect(await ltrHebrew(page, 'section[data-panel-id="p1"]')).toEqual([]);
    });
  }
});

