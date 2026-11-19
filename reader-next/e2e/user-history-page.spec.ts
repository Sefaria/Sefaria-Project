import { expect, test } from "@playwright/test";

// The Saved / History / Notes page is @login_required on sefaria.org: signed out (the local dev server has no session) each address
// sends the reader to this client's sign-in page with ?next=, and /texts/notes is that page, not a /texts category. The signed-in
// lists are covered by the unit tests (src/lib/user/user-history-page.test.ts, src/ui/UserHistoryPage).
// @feature USL-008 @feature USL-003 @feature RTE-031 @feature RTE-015
test.describe("Saved, History and Notes, signed out", () => {
  for (const path of ["/saved", "/history", "/texts/notes"]) {
    test(`${path} goes to sign in and back`, async ({ page }) => {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(302);
      expect(res.headers()["location"]).toBe(`/login?next=${encodeURIComponent(path)}`);
      expect(res.headers()["x-served-by"] ?? "").not.toBe("django");
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    });
  }
});
