import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { open } from "./helpers";
// @ts-expect-error: a plain ES module shared with the parity script
import { normalize } from "../scripts/ref-corpus.cases.mjs";

/**
 * The ref torture corpus (LAUNCH_PLAN T-E02, T-E08), replayed through the cassette: every case where this reader matched
 * www.sefaria.org when scripts/ref-corpus.mjs last compared them (scripts/ref-corpus.expected.json) must keep landing on the same
 * address and highlighting the same segments. The cases that differ, and why, are KNOWN_DIFFERENCES in scripts/ref-corpus.cases.mjs.
 */
interface Expected {
  path: string;
  why: string;
  status: number;
  url: string;
  highlighted: string[];
  kind: string;
}
const CASES = JSON.parse(readFileSync(new URL("../scripts/ref-corpus.expected.json", import.meta.url), "utf8")) as Expected[];

test.describe("ref corpus: lands where sefaria.org lands", () => {
  for (const c of CASES) {
    test(`${c.path} (${c.why})`, async ({ page }) => {
      if (c.status >= 400) {
        const res = await page.request.get(c.path, { maxRedirects: 5 });
        expect(res.status()).toBe(c.status);
        return;
      }
      await open(page, c.path);
      await expect.poll(() => normalize(page.url()), { timeout: 15_000 }).toBe(c.url);
      if (c.kind === "text") {
        // the address is final (a range of whole sections is rewritten to its segments in place) and the text in
        await expect.poll(() => normalize(page.url())).toBe(c.url);
        const highlighted = await page.locator('[data-reader-scroller] [data-highlighted="true"][data-ref]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-ref")))]);
        expect(highlighted).toEqual(c.highlighted);
      }
    });
  }
});
