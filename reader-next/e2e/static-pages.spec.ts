import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";
import { recordStaticAnswer, seedStaticPages, staticContentUrl } from "./static-pages-cassette";

/**
 * The static information pages in the new shell (LAUNCH_PLAN T-F31, T-F32): Django's content block (?format=json&lang=…) rendered
 * by the server inside this client's header, with the legacy static-page CSS scoped to it.
 *
 * Django's answers come from e2e/fixtures/static-pages (rendered by Django from this branch's templates), written into the cassette
 * in its own format before the specs run (e2e/static-pages-cassette.ts): www.sefaria.org does not serve the content mode yet.
 */
test.beforeAll(() => {
  seedStaticPages();
  // a page Django does not have (its content answer is a 404): this client's own 404
  recordStaticAnswer(staticContentUrl("coming-soon", "en"), JSON.stringify({ error: "no such page" }), 404);
});

/** The embedded documents and videos are other sites': not needed here. */
const quiet = (page: Page) => page.route(/docs\.google\.com|youtube(-nocookie)?\.com/, (r) => r.abort());
const content = (page: Page) => page.locator("#staticContentWrapper #content");

// @feature STA-001 @feature STA-005 @feature STA-007 @feature STA-012 @feature STA-013
test.describe("static pages in the new shell", () => {
  test("the server renders /terms: title, content, the About sidebar with its item selected, the scoped legacy CSS (no flash)", async ({ page }) => {
    const html = await (await page.request.get("/terms")).text();
    expect(html).toContain("<title>Terms of Use | Sefaria</title>");
    expect(html).toMatch(/<link rel="stylesheet" href="\/static-page-styles\/legacy\.[0-9a-f]{8}\.css"/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/www\.sefaria\.org\/terms"/);
    expect(html).toContain('id="staticContentWrapper"');
    expect(html).toContain('<a id="terms" href="/terms" class="selected">');
    expect(html).not.toContain("getElementById(whichPage)"); // the content's script is not on the page

    await quiet(page);
    await open(page, "/terms");
    await expect(page.getByRole("banner")).toBeVisible(); // the new reader's own header
    await expect(content(page).getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
    await expect(content(page).locator("#aboutSidebar a.selected")).toHaveText("Terms of Use", { useInnerText: true });
    await expect(content(page).locator("iframe")).toHaveAttribute("src", /docs\.google\.com\/document/);
    // laid out by the old site's rules (common.css .static .inner: 660px; s2.css: links inherit the sidebar's grey)
    expect(await content(page).locator(".inner").evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(660);
    expect(await content(page).locator("#aboutSidebar a#privacy-policy").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(102, 102, 102)");
    // ...and nothing of them reaches the header
    expect(await page.getByRole("banner").evaluate((el) => getComputedStyle(el).fontFamily)).not.toContain("Taamey");
    // ...nor replaces the shell's own font files: every face of the families the shell declares is the shell's (src/ui/tokens/fonts.css)
    const faces = await page.evaluate(() => {
      const out: { family: string; src: string }[] = [];
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // another site's sheet (Typekit)
        }
        for (const r of [...rules]) if (r instanceof CSSFontFaceRule) out.push({ family: r.style.getPropertyValue("font-family").replace(/["']/g, ""), src: r.style.getPropertyValue("src") });
      }
      return out;
    });
    const shell = faces.filter((f) => /^(Taamey Frank|Cardo|Noto Color Emoji)$/.test(f.family));
    expect(shell.length).toBeGreaterThan(0);
    for (const f of shell) expect(f.src, f.family).not.toContain("/static/fonts/");
    expect(faces.some((f) => f.family === "FontAwesome")).toBe(true); // the legacy faces the shell lacks are still declared
  });

  test("Hebrew: the Hebrew page, right to left", async ({ page, context }) => {
    await context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/about");
    await expect(page).toHaveTitle("אודות ספריא");
    await expect(page.locator("#staticContentWrapper")).toHaveAttribute("dir", "rtl");
    await expect(content(page).locator("#aboutSidebar a.selected")).toHaveText("מהי ספריא", { useInnerText: true });
    await expect(content(page).getByText("What is Sefaria?")).toBeHidden(); // the other language's spans are hidden by the legacy rules
  });

  test("a link to another static page navigates inside the app; a page Django still renders loads in full", async ({ page }) => {
    await quiet(page);
    await open(page, "/about");
    await page.evaluate(() => ((window as unknown as { __stay: number }).__stay = 1));
    await content(page).locator("#aboutSidebar").getByRole("link", { name: "Terms of Use" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(content(page).getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
    await expect(page).toHaveTitle("Terms of Use | Sefaria");
    expect(await page.evaluate(() => (window as unknown as { __stay?: number }).__stay)).toBe(1); // no reload
    // the stylesheet came with it (fetched before the page showed)
    expect(await content(page).locator(".inner").evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(660);

    const team = content(page).locator("#aboutSidebar").getByRole("link", { name: "Team" });
    await expect(team).toHaveAttribute("href", "/team");
    await Promise.all([page.waitForEvent("load"), team.click()]);
    await expect(page).toHaveURL(/\/team$/);
    expect(await page.evaluate(() => (window as unknown as { __stay?: number }).__stay)).toBeUndefined(); // a full load
  });

  test("a page Django does not have is the reader's own 404", async ({ page }) => {
    const res = await open(page, "/coming-soon");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible();
  });

  test("/ways-to-give: the Hebrew page from Django's content, the English one (the old DonatePage) ported", async ({ page, context }) => {
    await open(page, "/ways-to-give");
    await expect(page).toHaveTitle("Donate to Sefaria");
    await expect(content(page).getByRole("heading", { level: 1, name: "Your gift. Your impact." })).toBeVisible();
    await expect(content(page).getByRole("link", { name: "Donate Now" }).first()).toHaveAttribute("href", /donate\.sefaria\.org\/give\/451346/);
    const faq = content(page).locator("details").filter({ hasText: "Is my donation tax-deductible?" });
    await faq.locator("summary").click();
    await expect(faq.getByText("registered 501(c)(3)")).toBeVisible();
    await context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/ways-to-give");
    await expect(page).toHaveTitle("תרומות לספריא");
    await expect(content(page).getByText("Your gift. Your impact.")).toHaveCount(0);
  });

  test("/educators (ported): Teach with Sefaria, its buttons and the newsletter sign-up", async ({ page }) => {
    await open(page, "/educators");
    await expect(page).toHaveTitle("Teach with Sefaria");
    await expect(content(page).getByRole("heading", { level: 1, name: "Teach with Sefaria" })).toBeVisible();
    await expect(content(page).getByRole("link", { name: "Help Center" })).toHaveAttribute("href", "https://help.sefaria.org/hc/en-us");
    await expect(content(page).getByPlaceholder("Sign up for Newsletter")).toBeVisible();
  });

  // parity S12: measured on www.sefaria.org at 1280px (2026-11-10, the first visible h1 of #content): /terms and /about 140,
  // /educators and /mobile 130. The legacy page starts under its fixed 60px header; ours below the header, 60px lower before the fix.
  test("the page starts where it does on sefaria.org (the content under the header, not 60px below it)", async ({ page }) => {
    for (const [path, y] of [["/terms", 140], ["/about", 140], ["/educators", 130], ["/mobile", 130]] as const) {
      await quiet(page);
      await open(page, path);
      const box = await content(page).locator("h1:visible").first().boundingBox();
      expect(Math.round(box!.y), path).toBe(y);
    }
  });

  test("/linker keeps its bookmarklet; /digitized-by-sefaria lists its texts", async ({ page }) => {
    await open(page, "/linker");
    await expect(content(page).locator('a[href^="javascript:"]')).toHaveCount(1);
    await expect(content(page).locator("script")).toHaveCount(0);
    await open(page, "/digitized-by-sefaria");
    await expect(content(page).locator("#digitizedBySefaria")).toContainText("Rashi on Genesis");
  });
});

// @feature STA-008 @feature PRM-016
test.describe("/mobile (ported: T-F32)", () => {
  test("the app page in the new shell; its store buttons carry the visit's campaign from the first paint; the newsletter sign-up", async ({ page }) => {
    const html = await (await page.request.get("/mobile?utm_source=news&utm_medium=email&utm_campaign=spring")).text();
    expect(html).toContain("ct=news-email-spring");
    await open(page, "/mobile?utm_source=news&utm_medium=email&utm_campaign=spring");
    await expect(page).toHaveTitle("Sefaria Mobile Apps");
    await expect(content(page).getByRole("heading", { level: 1, name: "The Sefaria Library App" })).toBeVisible();
    await expect(content(page).getByRole("link", { name: "Download for iOS" }).first()).toHaveAttribute("href", /ct=news-email-spring/);
    await expect(content(page).getByRole("link", { name: "Download for Android" }).first()).toHaveAttribute("href", /referrer=utm_source%3Dnews/);
    await expect(content(page).getByText("Receive the latest updates")).toBeVisible();
    await expect(content(page).getByPlaceholder("Sign up for Newsletter")).toBeVisible();
  });

  test("@mobile on a phone the page keeps the site header", async ({ page }) => {
    await open(page, "/mobile");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(content(page).getByRole("heading", { level: 1, name: "The Sefaria Library App" })).toBeVisible();
  });
});
