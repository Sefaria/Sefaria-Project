import { expect, test } from "@playwright/test";
import { open } from "./helpers";

/**
 * What the reader's server answers itself instead of a round trip through Django (T-F26), and links to this client's pages written as
 * relative addresses so they navigate in the app (T-F02). Django's answers were read on www.sefaria.org on 2026-11-10 (curl -sI).
 * The 404 hand-off and the language bounce need Django behind the server (pass-through): e2e/routing-pass-through.spec.ts.
 */
// @feature RTE-037 @feature RTE-015
test.describe("redirects answered by the reader's server", () => {
  for (const [path, status, location] of [
    ["/people", 301, "/topics/category/authors"],
    ["/people/", 301, "/topics/category/authors"],
    ["/people/Talmud", 301, "/topics/category/talmudic-figures"],
    ["/texts/recent", 301, "/texts/history"],
    ["/contributors/someone", 301, "/profile/someone"],
    ["/contributors/someone/2", 301, "/profile/someone"],
    // deliberate difference: Django sends this to the Voices profile (or to login); this client has the notes page
    ["/my/notes", 302, "/texts/notes"],
  ] as const) {
    test(`${path} → ${status} ${location}`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(status);
      expect(res.headers().location).toBe(location);
      expect(res.headers()["x-served-by"]).toBe("reader-redirect");
    });
  }
});

// @feature GUI-002
test("the header's Texts and Topics are relative links that navigate inside the app", async ({ page }) => {
  await open(page, "/Genesis.1");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Topics", exact: true })).toHaveAttribute("href", "/topics");
  await expect(header.getByRole("link", { name: "Texts", exact: true })).toHaveAttribute("href", "/texts");
  // an in-app navigation keeps the document: a marker set on window survives
  await page.evaluate(() => ((window as unknown as { __stay: boolean }).__stay = true));
  await header.getByRole("link", { name: "Texts", exact: true }).click();
  await expect(page).toHaveURL(/\/texts$/);
  expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay)).toBe(true);
});
