import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// Signed out (the local dev server has no session): reading history goes to the user_history cookie, as on sefaria.org;
// Save asks to sign up and sends nothing. The signed-in path is covered by unit/hook tests and, against a deployment, by
// e2e/auth-signed-in.spec.ts.
// @feature USL-010 @feature USL-011 @feature USL-001 @feature GUI-004
test.describe("reading history and Save, signed out", () => {
  test("opening a text records it in the user_history cookie; a verse chosen with the sidebar records that verse", async ({ page, context }) => {
    const posts: string[] = [];
    page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/profile/sync") && posts.push(r.url()));
    await open(page, "/Genesis.1?lang=en");
    const history = async () => {
      const c = (await context.cookies()).find((x) => x.name === "user_history");
      return c ? (JSON.parse(decodeURIComponent(c.value)) as { ref: string; book?: string }[]) : [];
    };
    await expect.poll(async () => (await history())[0]?.ref).toBe("Genesis 1");
    expect((await history())[0]!.book).toBe("Genesis");
    await page.locator('[role="group"][data-ref="Genesis 1:3"]').click({ position: { x: 60, y: 10 } });
    await expect.poll(async () => (await history())[0]?.ref).toBe("Genesis 1:3");
    expect(posts).toEqual([]);
  });

  test("Save asks to sign up and sends nothing", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/profile/sync") && posts.push(r.url()));
    await open(page, "/Genesis.1?lang=en");
    await page.locator("main header").first().getByRole("button", { name: /^Save "/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(posts).toEqual([]);
  });
});
