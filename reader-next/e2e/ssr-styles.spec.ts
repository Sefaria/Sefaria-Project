import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The server-rendered page links every stylesheet its first paint needs (v-exits F-2). Each page kind of the `$` route is its own
 * dynamically imported chunk, and the route manifest lists only static imports' CSS: the reader's classes (the Workspace chunk)
 * arrived with the JS, so the first paint was unstyled (its panel header stacked to 228px) and hydration shifted the page by ~0.4.
 * The fix is vite-plugins/page-kind-css.ts. Dev links every module's CSS itself, so the production build is the case that matters:
 * E2E_SSR_BASE_URL points this spec at a built server (`npm run build`, then `PUBLIC_API_ORIGIN=<the cassette> PORT=… node
 * server/index.mjs`).
 */
if (process.env.E2E_SSR_BASE_URL) test.use({ baseURL: process.env.E2E_SSR_BASE_URL });

/** Every stylesheet the server's HTML links, fetched. */
async function linkedCss(request: APIRequestContext, html: string): Promise<string> {
  const hrefs = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).filter((tag) => /rel="stylesheet"/.test(tag)).map((tag) => /href="([^"]+)"/.exec(tag)?.[1] ?? "").filter((href) => href.startsWith("/"));
  const bodies = await Promise.all(hrefs.map(async (href) => (await request.get(href.replace(/&amp;/g, "&"))).text()));
  return bodies.join("\n");
}

for (const [path, what, selector] of [
  ["/Genesis.1", "the reader's panel header", "main header"],
  ["/Genesis", "the book page's header", "main h1"],
] as const) {
  // @feature TXD-054
  test(`${path}: the server's HTML links the stylesheet of ${what}`, async ({ request, browser }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();
    // the classes the server put on the element are defined in a stylesheet the HTML links
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(path);
    const classes = (await page.locator(selector).first().getAttribute("class"))?.split(/\s+/).filter(Boolean) ?? [];
    expect(classes.length).toBeGreaterThan(0);
    const css = await linkedCss(request, html);
    for (const cls of classes) expect(css, `.${cls} is in a linked stylesheet`).toContain(`.${cls}`);
    await ctx.close();
  });
}

// @feature TXD-054
test("/Genesis.1 without JavaScript: the panel header is laid out (60px), not stacked", async ({ browser }) => {
  // what the reader sees before the scripts arrive (a slow phone): the server's HTML and its stylesheets only
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  await page.goto("/Genesis.1");
  const box = await page.locator("main header").first().boundingBox();
  expect(box?.height).toBeLessThanOrEqual(64);
  await ctx.close();
});

/** The CSS-module classes (`_name_hash_N`) in rendered markup, grouped by module (the hash). */
function moduleClasses(html: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of html.replace(/<script[\s\S]*?<\/script>/g, "").matchAll(/class="([^"]*)"/g))
    for (const c of m[1]!.split(/\s+/)) {
      const h = /^_[A-Za-z0-9]+_([a-z0-9]{5})_\d+$/.exec(c)?.[1];
      if (h && !(out.get(h) ?? []).includes(c)) out.set(h, [...(out.get(h) ?? []), c]);
    }
  return out;
}

/**
 * Every CSS module used in the server's HTML has its stylesheet linked by that HTML. Per module, not per class: a class whose rule is
 * empty (`.secondary { }`) is dropped by the minifier, but a module with none of its classes defined is a stylesheet that never came.
 * Seen on staging: /Sefer_HaBahir rendered BookPage's classes with none of its rules linked.
 */
const ROUTES = ["/Genesis.1", "/Sefer_HaBahir", "/texts", "/texts/Tanakh", "/topics", "/topics/light", "/search?q=light", "/calendars", "/about"];
for (const path of ROUTES) {
  // @feature PLT-003
  test(`${path}: every CSS module in the server's HTML has its stylesheet in the head`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBeLessThan(500);
    const html = await res.text();
    const css = await linkedCss(request, html);
    const modules = moduleClasses(html);
    expect(modules.size).toBeGreaterThan(0);
    const unstyled = [...modules].filter(([, classes]) => !classes.some((c) => css.includes(`.${c}`))).map(([h, classes]) => `${h} (${classes.slice(0, 3).join(" ")})`);
    expect(unstyled, "modules with no rule in any linked stylesheet").toEqual([]);
  });
}

// The other half of the staging report: after hydration the book page stayed unstyled, because the browser never asked for its CSS
// (the build merged `kind === "book" ? import(A) : import(B)` into one preload with B's dependencies only: page-kinds.tsx)
// @feature PLT-003
test("in the browser, every CSS module on the page has rules, on load and after an in-app move to another page kind", async ({ page }) => {
  const unstyled = () =>
    page.evaluate(() => {
      const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch { return ""; } }).join("\n");
      const byHash = new Map<string, string[]>();
      for (const el of document.querySelectorAll("main [class]")) for (const c of el.classList) { const h = /^_[A-Za-z0-9]+_([a-z0-9]{5})_\d+$/.exec(c)?.[1]; if (h) byHash.set(h, [...(byHash.get(h) ?? []), c]); }
      return [...byHash].filter(([, cs]) => !cs.some((c) => css.includes(`.${c}`))).map(([h]) => h);
    });
  await page.goto("/Sefer_HaBahir");
  await page.waitForSelector("html[data-hydrated='true']");
  await expect.poll(unstyled).toEqual([]);
  // a text first, then the book page reached in the app (the book kind's code and CSS load on the way)
  await page.goto("/Genesis.1");
  await page.waitForSelector("html[data-hydrated='true']");
  await page.evaluate(() => ((window as unknown as { __stay: boolean }).__stay = true));
  // the router follows the browser's history: a pushed entry and a popstate move it without a page load
  await page.evaluate(() => {
    history.pushState(null, "", "/Sefer_HaBahir");
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  });
  await expect(page.locator("main h1")).toHaveText(/Sefer HaBahir/);
  await expect(page.locator("main h1")).toBeVisible();
  // it was a move in the app, not a page load
  expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay)).toBe(true);
  await expect.poll(unstyled).toEqual([]);
});
