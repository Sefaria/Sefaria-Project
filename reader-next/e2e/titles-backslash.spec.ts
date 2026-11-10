import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// A title may hold a backslash, written %5C (wiki reader-next _index "Titles may hold / and \"; one title in 67,472). It was a 404 on a
// page load: h3 decoded %5C in the request URL it shares with srvx into "/" (src/server.ts). The ref corpus case, kept here.
const PATH = "/Judaism's_Life_Changing_Ideas;_A_Weekly_Reading_of_the_Jewish_Bible,_Matot;_Subject%5CObject";

test("a title with a backslash opens in the reader and keeps its address", async ({ page, request }) => {
  const r = await request.get(PATH, { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  await open(page, PATH);
  await expect(page.locator("[data-reader-scroller] [role='group'][data-ref]").first()).toBeVisible();
  await expect(page.getByText(/Text not found|Page not found/)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toMatch(/Subject%5CObject/);
  // the reader is on that text (the column may also hold the section before it)
  await expect
    .poll(() => page.locator("[data-reader-scroller] [role='group'][data-ref]").evaluateAll((els) => els.some((e) => e.getAttribute("data-ref")!.includes("Subject\\Object"))))
    .toBe(true);
});
