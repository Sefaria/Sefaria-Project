import { expect, test } from "@playwright/test";

/**
 * The reader's server with Django behind it (pass-through on): its own 404 once Django has said 404 too (T-F28), and the
 * language-domain bounce (T-E07). The suite's dev servers run without pass-through, so this needs a server of its own:
 *
 *   PORT=3365 SEFARIA_PASS_THROUGH=1 \
 *   DOMAIN_MODULES='{"en":{"library":"http://localhost:3365"},"he":{"library":"http://127.0.0.1:3365"}}' npm run dev
 *   E2E_PASS_THROUGH_URL=http://localhost:3365 npx playwright test e2e/routing-pass-through.spec.ts
 *
 * (Django is then www.sefaria.org, read only. Every request carries interfaceLang=english: live Django bounces a visitor whose
 * country is Israel to sefaria.org.il.) Skipped without E2E_PASS_THROUGH_URL.
 */
const BASE = process.env.E2E_PASS_THROUGH_URL;
const EN = "interfaceLang=english";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

test.describe("with Django behind the reader's server", () => {
  test.skip(!BASE, "needs a pass-through dev server (E2E_PASS_THROUGH_URL)");
  test.use({ baseURL: BASE, userAgent: CHROME });
  test.beforeEach(async ({ context }) => {
    const host = new URL(BASE!).hostname;
    await context.addCookies([
      { name: "interfaceLang", value: "english", domain: host, path: "/" },
      { name: "cookiesNotificationAccepted", value: "1", domain: host, path: "/" },
    ]);
  });

  // @feature RTE-040
  for (const path of ["/no-such-page-at-all-xyz", "/person/Nobody-at-all", "/people/no-such-list"]) {
    test(`${path}: Django has nothing either, so the reader's own 404 page, in the shell`, async ({ page }) => {
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

  test("on a phone the 404 page keeps the site header", async ({ page }) => {
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

  // @feature RTE-059
  test.describe("the language-domain bounce (DOMAIN_MODULES: localhost English, 127.0.0.1 Hebrew)", () => {
    const he = { host: `127.0.0.1:${new URL(BASE ?? "http://x:1").port}` };
    test("the Hebrew interface cookie on the English domain goes to the Hebrew one, and back", async ({ request }) => {
      const a = await request.get("/Genesis.1?lang=he", { maxRedirects: 0, headers: { cookie: "interfaceLang=hebrew" } });
      expect(a.status()).toBe(302);
      expect(a.headers().location).toBe(`http://${he.host}/Genesis.1?lang=he&set-language-cookie=`);
      const b = await request.get("/topics", { maxRedirects: 0, headers: { ...he, cookie: EN } });
      expect(b.status()).toBe(302);
      expect(b.headers().location).toBe(`${BASE}/topics?set-language-cookie=`);
    });
    test("arriving with set-language-cookie sets the domain's language and cleans the address", async ({ request }) => {
      const r = await request.get("/Genesis.1?set-language-cookie=", { maxRedirects: 0, headers: { ...he } });
      expect(r.status()).toBe(302);
      expect(r.headers().location).toBe(`http://${he.host}/Genesis.1`);
      expect(r.headers()["set-cookie"]).toContain("interfaceLang=hebrew");
    });
    test("the language that matches the domain stays; crawlers stay", async ({ request }) => {
      expect((await request.get("/texts", { maxRedirects: 0, headers: { ...he, cookie: "interfaceLang=hebrew" } })).status()).toBe(200);
      expect((await request.get("/texts", { maxRedirects: 0, headers: { cookie: EN } })).status()).toBe(200);
      expect((await request.get("/texts", { maxRedirects: 0, headers: { ...he, cookie: EN, "user-agent": "Googlebot/2.1" } })).status()).toBe(200);
    });
  });
});
