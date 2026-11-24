import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { focused, open, wheel } from "./helpers";

/**
 * The social surface seam (contract/surface-host.v1.ts): the reader loads a surface at run time and hands it a SurfaceHost. Runs
 * against the e2e dev server with the `social` lab on (E2E_SOCIAL_URL, playwright.config.ts), whose surface is configured on
 * E2E_SURFACE_ORIGIN: nothing listens there, these tests serve the reference surface (e2e/fixtures/social-surface) with page.route,
 * with a manifest whose integrity hashes they compute. A test can serve a broken surface instead (a 404, a throwing entry, a wrong
 * hash) and check the reader still works.
 */
const SOCIAL_URL = process.env.E2E_SOCIAL_URL!;
const SURFACE = process.env.E2E_SURFACE_ORIGIN!;
const FIXTURES = new URL("./fixtures/social-surface/", import.meta.url);
const CTX = "social.room.reference1";

const file = (name: string) => readFileSync(new URL(name, FIXTURES), "utf8");
const sri = (body: string) => `sha384-${createHash("sha384").update(body).digest("base64")}`;
const CORS = { "access-control-allow-origin": "*" };

/**
 * bad-integrity: the entry's hash does not match. bad-chunk-integrity: only a chunk's does — the loader never waits for a chunk's
 * preload, so this proves the browser's module map enforces the hash when the entry imports the chunk (src/lib/surfaces/load.ts).
 */
type Variant = "ok" | "manifest-404" | "entry-throws" | "bad-integrity" | "bad-chunk-integrity" | "wrong-contract";

/** Serve the reference surface (or a broken variant of it) on the surface origin, for this page. */
async function serveSurface(page: Page, variant: Variant = "ok") {
  const entry = variant === "entry-throws" ? `throw new Error("the reference surface failed on purpose");\nexport default {};\n` : file("entry.js");
  const chunk = file("chunk.js");
  const css = file("social.css");
  const manifest = {
    version: "e2e-1",
    contract: variant === "wrong-contract" ? 2 : 1,
    entry: "entry.js",
    integrity: variant === "bad-integrity" ? sri(`${entry}// not what is served`) : sri(entry),
    files: [
      { path: "chunk.js", integrity: variant === "bad-chunk-integrity" ? sri(`${chunk}// not what is served`) : sri(chunk) },
      { path: "social.css", integrity: sri(css) },
    ],
    css: ["social.css"],
  };
  const requests: string[] = [];
  await page.route(`${SURFACE}/social-surface/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace("/social-surface/", "");
    requests.push(path);
    if (path === "manifest.json")
      return variant === "manifest-404" ? route.fulfill({ status: 404, headers: CORS, body: "not here" }) : route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify(manifest) });
    const body = { "entry.js": entry, "chunk.js": chunk, "social.css": css }[path];
    if (body === undefined) return route.fulfill({ status: 404, headers: CORS, body: "" });
    return route.fulfill({ headers: CORS, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body });
  });
  return requests;
}

const surfaceUrl = (path: string) => `${SOCIAL_URL}${path}`;
const ctxOfPage = (page: Page) => new URL(page.url()).searchParams.get("ctx");

test.describe("the social surface (lab on)", () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(info.project.name !== "desktop" || browserName !== "chromium", "one browser is enough for the seam");
  });

  // @feature SHL-076 @feature SHL-077 @feature SHL-078
  test("the reference surface mounts at /social into a placeholder the server already sized", async ({ page, request }) => {
    const html = await (await request.get(surfaceUrl("/social"))).text();
    expect(html).toContain('data-surface-mount="page"');
    expect(html).not.toContain("Reference surface"); // the server renders the empty placeholder; the surface mounts in the browser
    const requests = await serveSurface(page);
    await open(page, surfaceUrl("/social"));
    const mount = page.locator('[data-surface-mount="page"]');
    await expect(page.getByTestId("reference-surface")).toBeVisible();
    await expect(mount).toHaveAttribute("data-surface-state", "mounted");
    await expect(page.getByTestId("surface-where")).toHaveText("at /social");
    await expect(page.getByTestId("reference-surface")).toHaveAttribute("data-lang", "english");
    // the entry, its chunk and its stylesheet, each linked with its hash
    expect(requests).toEqual(expect.arrayContaining(["manifest.json", "entry.js", "chunk.js", "social.css"]));
    const integrity = await page.locator("link[data-surface=social]").evaluateAll((ls) => ls.map((l) => [l.getAttribute("rel"), (l as HTMLLinkElement).integrity.slice(0, 7)]));
    expect(integrity).toEqual(expect.arrayContaining([["modulepreload", "sha384-"], ["stylesheet", "sha384-"]]));
    // the persistent mount is beside <main>, empty without a context
    await expect(page.locator('main ~ [data-surface-mount="persistent"]')).toHaveCount(1);
    await expect(page.getByTestId("surface-persistent")).toHaveCount(0);
  });

  // @feature SHL-076
  test("a path under /social is the surface's too", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl("/social/r/abcdefgh"));
    await expect(page.getByTestId("surface-where")).toHaveText("at /social/r/abcdefgh");
  });

  // @feature SHL-078 @feature RTE-066
  test("host.navigate opens a ref in a context, Back returns to the surface's page", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl("/social"));
    await page.getByTestId("surface-open-room").click();
    await expect(page).toHaveURL(new RegExp(`/Genesis\\.1\\?.*ctx=${CTX.replace(/\./g, "\\.")}`));
    await expect(page.locator('[role="group"][data-ref="Genesis 1:1"]')).toBeVisible();
    // the persistent mount follows the context from the address alone
    await expect(page.getByTestId("surface-ctx")).toHaveText(`in ${CTX}`);
    await page.goBack();
    await expect(page).toHaveURL(/\/social$/);
    await expect(page.getByTestId("reference-surface")).toBeVisible();
    await expect(page.getByTestId("surface-persistent")).toHaveCount(0);
  });

  // @feature SHL-078 @feature RTE-066
  test("a snapshot applied from the surface moves the reader and keeps its context", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl(`/Genesis.1?lang=bi&ctx=${CTX}`));
    await expect(page.getByTestId("surface-ctx")).toHaveText(`in ${CTX}`);
    await page.getByTestId("surface-persistent-apply").click();
    await expect(page).toHaveURL(/\/Genesis\.2\?/);
    await expect(page.locator('[role="group"][data-ref="Genesis 2:1"]')).toBeVisible();
    expect(ctxOfPage(page)).toBe(CTX);
    // and the snapshot the reader gives out never carries it
    const url = await page.evaluate(() => window.sefariaReaderState!.getSnapshot().url);
    expect(url).not.toContain("ctx");
  });

  // @feature SHL-078
  test("a snapshot applied from the page mount navigates the reader", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl("/social"));
    await page.getByTestId("surface-apply").click();
    await expect(page).toHaveURL(/\/Genesis\.2\?/);
    await expect(page.locator('[role="group"][data-ref="Genesis 2:1"]')).toBeVisible();
  });

  // @feature RTE-066
  test("ctx survives scrolling, a panel change and a refresh", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl(`/Genesis.1?lang=en&ctx=${CTX}`));
    await expect(page).toHaveURL(/aliyot=0&ctx=/); // the address completed, the context kept
    // scrolling: the address follows the verse being read (a replace), with the context
    await wheel(page, 300, 3);
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/Genesis\.1\.\d+$/);
    expect(ctxOfPage(page)).toBe(CTX);
    // a panel change: choosing a verse opens the sidebar
    const box = await page.locator(`[role="group"][data-ref="${await focused(page)}"]`).boundingBox();
    await page.mouse.click(box!.x + 80, box!.y + 10);
    await expect(page).toHaveURL(/with=all/);
    expect(ctxOfPage(page)).toBe(CTX);
    // a refresh: the address alone is the entry point
    await page.reload();
    await page.waitForSelector("html[data-hydrated='true']");
    expect(ctxOfPage(page)).toBe(CTX);
    await expect(page.getByTestId("surface-ctx")).toHaveText(`in ${CTX}`);
    // leaving the context is the surface's move
    await page.getByTestId("surface-leave").click();
    await expect(page).toHaveURL(/\/social$/);
  });

  // @feature RTE-066 @feature PLT-008
  test("the canonical link and og:url leave ctx out", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl(`/Genesis?ctx=${CTX}`));
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(/\/Genesis$/);
    expect(await page.locator('meta[property="og:url"]').getAttribute("content")).not.toContain("ctx");
  });

  // @feature RTE-066
  test("the share link leaves ctx out", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl(`/Genesis.1.1?lang=en&with=all&ctx=${CTX}`));
    await page.getByRole("complementary").getByRole("link", { name: "Share", exact: true }).click();
    const box = page.getByRole("complementary").getByRole("textbox", { name: "Shareable link" });
    await expect(box).toHaveValue(/\/Genesis\.1\.1\?.*with=Share/, { timeout: 20_000 });
    expect(await box.inputValue()).not.toContain("ctx");
    expect(ctxOfPage(page)).toBe(CTX); // the address keeps it
  });

  // @feature SHL-079
  test("openBeside: the page narrows into a column, still mounted, and the text comes in beside it; the close control and Back return", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl("/social"));
    await page.getByTestId("surface-kept").fill("kept while the text is open");
    await page.getByTestId("surface-open-beside").click();
    await expect(page).toHaveURL(/\/Genesis\.1\.3\?.*ctx=social\.beside/);
    await expect(page.locator('[role="group"][data-ref="Genesis 1:3"]')).toBeVisible();
    const pane = page.locator('[data-social-beside="pane"]');
    await expect(pane).toBeVisible();
    // the same element, moved: what was typed is still there, and the page still says it is at /social
    await expect(pane.getByTestId("surface-kept")).toHaveValue("kept while the text is open");
    await expect(pane.getByTestId("surface-where")).toHaveText("at /social");
    // the column is at the inline start, the text beside it
    const [p, m] = await Promise.all([pane.boundingBox(), page.locator("main").boundingBox()]);
    expect(p!.x).toBeLessThan(m!.x);
    expect(p!.width).toBeGreaterThanOrEqual(360);
    // the persistent mount sees the reader's address (and the context)
    await expect(page.getByTestId("surface-ctx")).toHaveText("in social.beside");
    // close: back to the page's own entry
    await page.getByRole("button", { name: "Close the text and go back to the feed" }).click();
    await expect(page).toHaveURL(/\/social$/);
    await expect(pane).toHaveCount(0);
    await expect(page.getByTestId("surface-kept")).toHaveValue("kept while the text is open");
    // Back from a text opened beside the page returns the same way; Forward opens it again
    await page.getByTestId("surface-open-beside").click();
    await expect(page).toHaveURL(/ctx=social\.beside/);
    await page.goBack();
    await expect(page).toHaveURL(/\/social$/);
    await expect(page.getByTestId("surface-kept")).toHaveValue("kept while the text is open");
    await page.goForward();
    await expect(pane).toBeVisible();
  });

  // @feature SHL-079
  test("openBeside: a refresh keeps the text beside the feed; Escape closes it to the feed", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl("/Genesis.1.3?lang=bi&ctx=social.beside"));
    const pane = page.locator('[data-social-beside="pane"]');
    await expect(pane.getByTestId("surface-where")).toHaveText("at /social");
    await expect(page.locator('[role="group"][data-ref="Genesis 1:3"]')).toBeVisible();
    await page.locator("main").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/social$/);
    await expect(page.getByTestId("surface-where")).toHaveText("at /social");
  });

  // @feature SHL-079
  test("openBeside refuses anything that is not a reader address", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl("/social"));
    await page.evaluate(() => (window as unknown as { __socialHost: { openBeside: (to: string) => void } }).__socialHost.openBeside("/texts"));
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/social$/);
  });

  for (const variant of ["manifest-404", "entry-throws", "bad-integrity", "bad-chunk-integrity", "wrong-contract"] as const) {
    // @feature SHL-077
    test(`the reader works when the surface fails (${variant})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await serveSurface(page, variant);
      await open(page, surfaceUrl(`/Genesis.1?lang=en&ctx=${CTX}`));
      await expect(page.locator('[role="group"][data-ref="Genesis 1:1"]')).toBeVisible();
      await expect(page.locator('[data-surface-mount="persistent"]')).toHaveAttribute("data-surface-state", "failed");
      await expect(page.getByTestId("surface-persistent")).toHaveCount(0);
      // the reader still navigates
      await page.locator('[role="group"][data-ref="Genesis 1:1"]').click();
      await expect(page).toHaveURL(/with=all/);
      // the surface's page shows its empty placeholder; the site around it works
      await open(page, surfaceUrl("/social"));
      await expect(page.locator('[data-surface-mount="page"]')).toHaveAttribute("data-surface-state", "failed");
      await expect(page.getByRole("banner")).toBeVisible();
      expect(errors.filter((e) => !/failed on purpose/.test(e))).toEqual([]);
    });
  }
});

// @feature SHL-079
test.describe("a text beside the social page on a phone", () => {
  test.beforeEach(({ browserName }, info) => {
    test.skip(info.project.name !== "mobile" || browserName !== "chromium", "the phone layout");
  });
  test("the text covers the page and Back to feed returns to it @mobile", async ({ page }) => {
    await serveSurface(page);
    await open(page, surfaceUrl("/social"));
    await page.getByTestId("surface-kept").fill("kept on a phone");
    await page.getByTestId("surface-open-beside").click();
    await expect(page.locator('[role="group"][data-ref="Genesis 1:3"]')).toBeVisible();
    await expect(page.locator('[data-social-beside="pane"]')).toBeHidden();
    const back = page.getByRole("button", { name: "Close the text and go back to the feed" });
    await expect(back).toBeVisible();
    await expect(back).toHaveText("Back to feed");
    await back.click();
    await expect(page).toHaveURL(/\/social$/);
    await expect(page.getByTestId("surface-kept")).toHaveValue("kept on a phone");
  });
});

// @feature SHL-076
test("with the lab off, /social is the reader's not-found page", async ({ page, request }) => {
  const res = await request.get("/social");
  expect(res.status()).toBe(404);
  expect(await (await request.get("/social/r/abcdefgh")).text()).not.toContain("data-surface-mount");
  await open(page, "/social");
  await expect(page.locator('[data-surface-mount]')).toHaveCount(0);
  await expect(page).toHaveTitle("Page Not Found | Sefaria");
});
