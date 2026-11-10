import { expect, test, type BrowserContext } from "@playwright/test";

/**
 * The reader's server with Django behind it (pass-through on): its own 404 once Django has said 404 too (T-F28), the language-domain
 * bounce (T-E07), and the Voices host left exactly as Django answers it. The same routing is unit-tested with Django stubbed in
 * src/server/site-routing.test.ts (which runs in every gate); this spec checks it end to end, rendered.
 *
 * SKIPPED unless E2E_PASS_THROUGH_URL is set: the suite's dev servers run without pass-through and without DOMAIN_MODULES (a change
 * to playwright.config.ts, requested of the integrator). To run it, start a pass-through server whose Django is the read-only
 * stand-in in front of www.sefaria.org (scripts/exits-crawl.mjs: it never forwards a write, and it signs in `sessionid=exits-crawl`):
 *
 *   EXITS_PORT=3365 DOMAIN_MODULES='{"en":{"library":"http://localhost:3365","voices":"http://voices.localhost:3365"},
 *     "he":{"library":"http://he.localhost:3365","voices":"http://chiburim.localhost:3365"}}' node scripts/exits-crawl.mjs --serve
 *   E2E_PASS_THROUGH_URL=http://localhost:3365 E2E_STANDIN=1 zsh pw-start.sh <worktree> <port> e2e/routing-pass-through.spec.ts
 *
 * E2E_STANDIN=1 says the Django behind it is that stand-in (the signed-in test needs its session; skipped without).
 */
const BASE = process.env.E2E_PASS_THROUGH_URL;
const PORT = BASE ? new URL(BASE).port : "1";
const HE = `he.localhost:${PORT}`;
const EN = "interfaceLang=english";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function cookies(context: BrowserContext, host: string, extra: { name: string; value: string }[] = []) {
  await context.addCookies([{ name: "cookiesNotificationAccepted", value: "1" }, ...extra].map((c) => ({ ...c, domain: host, path: "/" })));
}

test.describe("with Django behind the reader's server", () => {
  test.skip(!BASE, "needs a pass-through dev server with DOMAIN_MODULES (E2E_PASS_THROUGH_URL; see the comment at the top)");
  test.use({ baseURL: BASE, userAgent: CHROME });

  // @feature RTE-040
  for (const path of ["/no-such-page-at-all-xyz", "/person/Nobody-at-all", "/people/no-such-list"]) {
    test(`${path}: Django has nothing either, so the reader's own 404 page, in the shell`, async ({ page, context }) => {
      await cookies(context, "localhost", [{ name: "interfaceLang", value: "english" }]);
      const res = await page.goto(path);
      expect(res!.status()).toBe(404);
      expect(res!.headers()["x-served-by"]).toBeUndefined();
      expect(res!.headers()["x-robots-tag"]).toBe("noindex");
      await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
      await expect(page.getByText("If you've arrived here from a link on another site")).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page).toHaveTitle("Page Not Found | Sefaria");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    });
  }

  test("a Hebrew-interface reader gets the 404 page in Hebrew, right to left", async ({ page, context }) => {
    await cookies(context, "he.localhost", [{ name: "interfaceLang", value: "hebrew" }]);
    const hydration: string[] = [];
    page.on("console", (m) => m.type() === "error" && /hydrat/i.test(m.text()) && hydration.push(m.text()));
    const res = await page.goto(`http://${HE}/no-such-page-at-all-xyz`);
    await page.waitForSelector("html[data-hydrated='true']");
    expect(res!.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "הדף שביקשת איננו נמצא" })).toBeVisible();
    expect(hydration).toEqual([]); // the server render and the browser agree (the preferences ride on the not-found)
  });

  test("a signed-in reader's 404 page has the signed-in header and is never cached", async ({ page, context }) => {
    test.skip(!process.env.E2E_STANDIN, "needs the stand-in Django's session (E2E_STANDIN=1)");
    await cookies(context, "localhost", [{ name: "interfaceLang", value: "english" }, { name: "sessionid", value: "exits-crawl" }]);
    const res = await page.goto("/no-such-page-at-all-xyz");
    expect(res!.status()).toBe(404);
    expect(res!.headers()["cache-control"]).toBe("private, no-store");
    await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Saved items" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Sign Up" })).toHaveCount(0);
  });

  test("on a phone the 404 page keeps the site header", async ({ page, context }) => {
    await cookies(context, "localhost", [{ name: "interfaceLang", value: "english" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/no-such-page-at-all-xyz");
    await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("Django's own answers stay Django's: a redirect, an API's 404", async ({ request }) => {
    const r = await request.get("/person/Rashi", { maxRedirects: 0, headers: { cookie: EN } });
    expect(r.status()).toBe(301);
    expect(r.headers().location).toBe("/topics/rashi");
    expect(r.headers()["x-served-by"]).toBe("django");
    const api = await request.get("/api/no-such-endpoint-xyz", { headers: { cookie: EN } });
    expect(api.status()).toBe(404);
    expect(api.headers()["x-served-by"]).toBe("django");
  });

  test("the Voices host is passed through untouched: no redirect, bounce or 404 page of ours", async ({ request }) => {
    const voices = { host: `voices.localhost:${PORT}` };
    for (const path of ["/my/notes", "/people", "/contributors/someone"]) {
      const r = await request.get(path, { maxRedirects: 0, headers: { ...voices, cookie: "interfaceLang=hebrew" } });
      expect(r.headers()["x-served-by"], path).toBe("django");
      expect(r.headers().location ?? "", path).not.toContain("set-language-cookie");
    }
    const miss = await request.get("/no-such-page-at-all-xyz", { maxRedirects: 0, headers: { ...voices, cookie: EN } });
    expect(miss.headers()["x-served-by"]).toBe("django");
    expect(miss.headers()["x-robots-tag"]).toBeUndefined();
  });

  // @feature RTE-059
  test.describe("the language-domain bounce (localhost English, he.localhost Hebrew)", () => {
    const he = { host: HE };
    test("the Hebrew interface cookie on the English domain goes to the Hebrew one, and back", async ({ request }) => {
      const a = await request.get("/Genesis.1?lang=he", { maxRedirects: 0, headers: { cookie: "interfaceLang=hebrew" } });
      expect(a.status()).toBe(302);
      expect(a.headers().location).toBe(`http://${HE}/Genesis.1?lang=he&set-language-cookie=`);
      const b = await request.get("/topics", { maxRedirects: 0, headers: { ...he, cookie: EN } });
      expect(b.status()).toBe(302);
      expect(b.headers().location).toBe(`${BASE}/topics?set-language-cookie=`);
    });
    test("arriving with set-language-cookie sets the domain's language and cleans the address", async ({ request }) => {
      const r = await request.get("/Genesis.1?set-language-cookie=", { maxRedirects: 0, headers: { ...he } });
      expect(r.status()).toBe(302);
      expect(r.headers().location).toBe(`http://${HE}/Genesis.1`);
      expect(r.headers()["set-cookie"]).toContain("interfaceLang=hebrew");
    });
    test("the language that matches the domain stays; crawlers stay", async ({ request }) => {
      expect((await request.get("/texts", { maxRedirects: 0, headers: { ...he, cookie: "interfaceLang=hebrew" } })).status()).toBe(200);
      expect((await request.get("/texts", { maxRedirects: 0, headers: { cookie: EN } })).status()).toBe(200);
      expect((await request.get("/texts", { maxRedirects: 0, headers: { ...he, cookie: EN, "user-agent": "Googlebot/2.1" } })).status()).toBe(200);
    });
  });
});
