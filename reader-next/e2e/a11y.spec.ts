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

// CODE_REVIEW R-31: every verse was a tab stop (Genesis 1: 31 before anything after the text), and the selected verse was not exposed
test.describe("keyboard in the reading column", () => {
  test("one tab stop for the text; arrow keys move between verses; the selected verse is announced as current", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    const stops = await page.locator('[role="group"][data-selectable="true"][tabindex="0"]').count();
    expect(stops).toBe(1);
    const first = page.locator('[role="group"][data-selectable="true"][tabindex="0"]');
    await first.focus();
    const startRef = await first.getAttribute("data-ref");
    await page.keyboard.press("ArrowDown");
    const nowRef = await page.evaluate(() => document.activeElement?.getAttribute("data-ref"));
    expect(nowRef).not.toBe(startRef);
    expect(await page.locator('[role="group"][data-selectable="true"][tabindex="0"]').count()).toBe(1);
    await page.keyboard.press("Enter"); // choose it: the sidebar opens on it
    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.locator('[role="group"][aria-current="true"]')).toHaveCount(1);
  });
});
