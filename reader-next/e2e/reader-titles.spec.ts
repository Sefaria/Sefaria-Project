import { expect, test, type BrowserContext } from "@playwright/test";
import { open } from "./helpers";

/**
 * The reader's page title and the Hebrew interface's text language, as www.sefaria.org (read 2026-11-10: src/lib/reader/page-title.ts).
 * v-parity S2 / v-a11y S4 (titles), v-parity B1 (a Hebrew-interface reader opens texts in Hebrew: legacy middleware.py:194).
 */
const hebrew = (context: BrowserContext) => context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);

// @feature PLT-006
test.describe("reader titles", () => {
  test("English interface: the ref, 'with' the sidebar's source, the library's suffix", async ({ page }) => {
    await open(page, "/Genesis.1");
    await expect(page).toHaveTitle("Genesis 1 | The Sefaria Library");
    await open(page, "/Genesis.1.1?with=Translations");
    await expect(page).toHaveTitle("Genesis 1:1 with Translations | The Sefaria Library");
    await open(page, "/Genesis.1.1?with=all");
    await expect(page).toHaveTitle("Genesis 1:1 | The Sefaria Library");
  });

  test("the server's HTML carries the title (no script needed)", async ({ request }) => {
    const html = await (await request.get("/Genesis.1.1?with=About")).text();
    expect(html).toContain("<title>Genesis 1:1 with About | The Sefaria Library</title>");
  });

  test("Hebrew interface: the Hebrew ref and suffix", async ({ page, context }) => {
    await hebrew(context);
    await open(page, "/Genesis.1?lang=bi");
    await expect(page).toHaveTitle("בראשית א׳ | האוסף של ספריא");
    await open(page, "/Genesis.1.1?lang=bi&with=Translations");
    await expect(page).toHaveTitle("בראשית א׳:א עם תרגומים | האוסף של ספריא");
  });

  test("a text that does not exist: the 404's title, in each interface", async ({ page, context }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    await expect(page).toHaveTitle("Page Not Found | Sefaria");
    await page.goto("/Genesis.999");
    await expect(page).toHaveTitle("Page Not Found | Sefaria");
    await hebrew(context);
    await page.goto("/this-page-does-not-exist-xyz");
    await expect(page).toHaveTitle("הדף שביקשתם איננו נמצא | ספריא");
  });
});

// @feature I18-001
test.describe("Hebrew interface: texts open in Hebrew", () => {
  test("no choice made: Hebrew only, written into the address", async ({ page, context }) => {
    await hebrew(context);
    await open(page, "/Genesis.1");
    await expect(page).toHaveURL(/[?&]lang=he\b/);
    await expect(page.getByText("When God began to create")).toHaveCount(0);
    const html = (await (await page.request.get("/Genesis.1")).text()).replace(/<script[\s\S]*?<\/script>/g, "");
    expect(html).toContain('data-language="hebrew"');
  });

  test("the reader's own choice still wins", async ({ page, context }) => {
    await hebrew(context);
    await context.addCookies([{ name: "contentLang", value: "bilingual", domain: "localhost", path: "/" }]);
    await open(page, "/Genesis.1");
    await expect(page).toHaveURL(/[?&]lang=bi\b/);
    await expect(page.getByText("When God began to create").first()).toBeVisible();
  });

  test("English interface: still bilingual", async ({ page }) => {
    await open(page, "/Genesis.1");
    await expect(page).toHaveURL(/[?&]lang=bi\b/);
  });
});
