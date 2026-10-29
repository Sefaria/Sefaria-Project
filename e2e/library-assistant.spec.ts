import { expect, test } from "@playwright/test";
import { open } from "./helpers";

/**
 * What the Library Assistant asks of the page: the three `sefaria:bootstrap-url` payloads its build dispatches (lc-chatbot.umd.cjs,
 * 2026-10-29) — a source link `{url: path, replaceHistory: true}`, a link `{url}`, a topic `{url: "/topics/<slug>"}` — through
 * src/lib/integration/legacy-events.ts. A marker on window tells a navigation in the app from a page load.
 * @feature AI-011
 */
const ask = (page: import("@playwright/test").Page, detail: unknown) =>
  page.evaluate((d) => document.dispatchEvent(new CustomEvent("sefaria:bootstrap-url", { detail: d })), detail);
const inApp = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __mark?: number }).__mark === 1);

test.describe("the Library Assistant's links", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a source link replaces the entry in the app; the panels become the link's", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi&p2=Exodus.1&lang2=bi");
    await page.evaluate(() => ((window as unknown as { __mark: number }).__mark = 1));
    const length = await page.evaluate(() => history.length);
    await ask(page, { url: "/Genesis.12.1?lang=bi", replaceHistory: true });
    await expect.poll(() => new URL(page.url()).pathname).toBe("/Genesis.12.1");
    await expect(page.locator('[role="group"][data-ref="Genesis 12:1"]')).toBeVisible();
    expect(new URL(page.url()).searchParams.get("p2")).toBeNull(); // a ref closes all panels, as on sefaria.org
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect(await inApp(page)).toBe(true);
  });

  test("a link to a page of this client is a new entry in the app", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await page.evaluate(() => ((window as unknown as { __mark: number }).__mark = 1));
    const length = await page.evaluate(() => history.length);
    await ask(page, { url: "/search?q=light&tab=text&search_tab=sources&tvar=1&tsort=relevance" });
    await expect.poll(() => new URL(page.url()).pathname).toBe("/search");
    expect(await page.evaluate(() => history.length)).toBe(length + 1);
    expect(await inApp(page)).toBe(true);
  });

  test("a topic (a page Django serves) is loaded in full; another site is ignored", async ({ page }) => {
    await page.route("**/topics/shabbat", (r) => r.fulfill({ contentType: "text/html", body: "<html><body>Django's topic page</body></html>" }));
    await open(page, "/Genesis.1?lang=bi");
    await page.evaluate(() => ((window as unknown as { __mark: number }).__mark = 1));
    await ask(page, { url: "https://evil.example.com/phish" });
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe("/Genesis.1");
    await ask(page, { url: "/topics/shabbat" });
    await expect(page.getByText("Django's topic page")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/topics/shabbat");
  });
});
