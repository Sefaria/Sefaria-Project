import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * An axe pass over the key pages, as served (CODE_REVIEW §3.8): the stories check components one by one; this checks them put
 * together (landmarks, headings, the header around the reader). WCAG 2.1 A and AA.
 */
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

async function violations(page: Page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    type Axe = { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }>; getRules: (tags?: string[]) => { ruleId: string }[] };
    const axe = (window as unknown as { axe: Axe }).axe;
    // WCAG 2.1 A/AA, plus the landmark and heading structure rules (axe files those under best practice)
    const STRUCTURE = ["landmark-no-duplicate-main", "landmark-main-is-top-level", "landmark-one-main", "landmark-unique", "page-has-heading-one", "heading-order"];
    const wcag = axe.getRules(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).map((r) => r.ruleId);
    const r = await axe.run(document, { runOnly: { type: "rule", values: [...new Set([...wcag, ...STRUCTURE])] } });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  });
}

const PAGES = [
  "/",
  "/texts",
  "/texts/Tanakh",
  "/Genesis",
  "/Genesis.1",
  "/Genesis.1.1?lang=bi&with=all",
  "/Berakhot.2a",
  "/search?q=love&tab=text",
  "/login",
  "/register",
];

// @feature I18-004 @feature I18-005
test.describe("accessibility of the key pages (axe, WCAG 2.1 AA)", () => {
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await open(page, path);
      await page.waitForLoadState("networkidle");
      expect(await violations(page)).toEqual([]);
    });
  }
  test("Hebrew interface: /Genesis.1", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/Genesis.1");
    await page.waitForLoadState("networkidle");
    expect(await violations(page)).toEqual([]);
  });
});

// As on sefaria.org, Tab reads down the text verse by verse: the links and note markers inside a verse are not tab stops (R-31 had
// made the whole text one stop, so Tab left it after the first verse, by way of every note marker in the chapter). The arrow keys
// still move between verses and into a verse's links and markers; the selected verse is announced as current.
test.describe("keyboard in the reading column", () => {
  const active = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-ref]")?.getAttribute("data-ref") + "|" + document.activeElement?.tagName);
  test("Tab goes verse by verse, past the note markers in them", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi"); // Genesis 1:1-2 carry note markers (a, b, c)
    await page.locator('[role="group"][data-ref="Genesis 1:1"]').focus();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      seen.push(await active(page));
    }
    expect(seen).toEqual(["Genesis 1:2|DIV", "Genesis 1:3|DIV", "Genesis 1:4|DIV", "Genesis 1:5|DIV", "Genesis 1:6|DIV"]);
    await page.keyboard.press("Shift+Tab");
    expect(await active(page)).toBe("Genesis 1:5|DIV");
  });
  test("arrow keys: down to the next verse, right into its note markers, Esc back to the verse; Enter chooses it", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await page.locator('[role="group"][data-ref="Genesis 1:1"]').focus();
    await page.keyboard.press("ArrowDown");
    expect(await active(page)).toBe("Genesis 1:2|DIV");
    await page.keyboard.press("ArrowRight");
    expect(await active(page)).toBe("Genesis 1:2|SUP");
    await page.keyboard.press("Enter"); // the marker opens its note
    await expect(page.locator('[role="group"][data-ref="Genesis 1:2"] [data-note][aria-expanded="true"]')).toHaveCount(1);
    await page.keyboard.press("Escape");
    expect(await active(page)).toBe("Genesis 1:2|DIV");
    await page.keyboard.press("Enter"); // choose it: the sidebar opens on it
    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.locator('[role="group"][aria-current="true"]')).toHaveAttribute("data-ref", "Genesis 1:2");
  });
});
