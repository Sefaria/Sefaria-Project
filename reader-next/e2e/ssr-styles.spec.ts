import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The server-rendered page links every stylesheet its first paint needs (v-exits F-2). Each page kind of the `$` route is its own
 * dynamically imported chunk, and the route manifest lists only static imports' CSS: the reader's classes (the Workspace chunk)
 * arrived with the JS, so the first paint was unstyled (its panel header stacked to 228px) and hydration shifted the page by ~0.4.
 * The fix is vite-plugins/page-kind-css.ts. Dev links every module's CSS itself, so the production build is the case that matters:
 * E2E_SSR_BASE_URL points this spec at a built server (`npm run build`, then `PUBLIC_API_ORIGIN=<the cassette> PORT=… node
 * server/index.mjs`): reports/w4-a-route.md.
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
