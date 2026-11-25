import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature GUI-002 @feature GUI-003 @feature GUI-009 @feature GUI-010 @feature I18-002 @feature I18-008 @feature RTE-034 @feature GUI-007 @feature SHL-071
test.describe("the page around the reader (verified against sefaria.org)", () => {
  test("header: logo, Texts, Topics, Donate, search, Sign Up and the four icons; skip link is the first tab stop", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav.getByRole("link", { name: "Texts" })).toHaveAttribute("href", "/texts"); // this client's page: relative (T-F02)
    await expect(nav.getByRole("link", { name: "Topics" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Donate" })).toHaveAttribute("target", "_blank");
    const header = page.getByRole("banner");
    await expect(header.getByRole("search")).toBeVisible();
    await expect(header.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", /\/register\?next=/);
    for (const name of ["Help", "Toggle Interface Language Menu", "Library", "Account menu"]) await expect(header.getByRole(name === "Help" ? "link" : "button", { name, exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("the module switcher lists Library, Voices, Developers and More from Sefaria", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.getByRole("banner").getByRole("button", { name: "Library", exact: true }).click();
    const menu = page.getByRole("dialog", { name: "Library" });
    await expect(menu.getByRole("link", { name: "Voices" })).toHaveAttribute("href", "https://voices.sefaria.org/");
    await expect(menu.getByRole("link", { name: "Developers" })).toHaveAttribute("href", "https://developers.sefaria.org");
    await expect(menu.getByRole("link", { name: /More from Sefaria/ })).toBeVisible();
  });

  test("switching the interface language to Hebrew comes back to the same text, in Hebrew", async ({ page }) => {
    await open(page, "/Genesis.1?lang=bi");
    await page.getByRole("banner").getByRole("button", { name: "Toggle Interface Language Menu" }).click();
    await page.getByRole("dialog", { name: "Toggle Interface Language Menu" }).getByTestId("lang-he").click();
    await expect(page).toHaveURL(/\/Genesis\.1\?lang=bi/);
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.getByRole("banner").getByRole("link", { name: "להרשמה" })).toBeVisible();
  });

  // @feature I18-002 T-G02: VERIFIED on sefaria.org 2026-11-10 with Playwright at 1280px (/interface/hebrew?next=/texts): the bar's
  // links say טקסטים, נושאים, תרומה (the Hebrew campaign); the search box is Heebo 18px, right to left, 216×28.5 at y=15.25
  test("the Hebrew interface's bar: its labels, the Hebrew donation campaign and the search box as sefaria.org's", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/texts");
    const nav = page.getByRole("banner").getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav.getByRole("link")).toHaveText(["", "טקסטים", "נושאים", "תרומה"]);
    await expect(nav.getByRole("link", { name: "תרומה" })).toHaveAttribute("href", /\/give\/468442\/.*c_src=Header$/);
    const box = page.getByRole("banner").getByRole("combobox").first();
    await expect(box).toHaveAttribute("placeholder", "חיפוש");
    const style = await box.evaluate((i) => ({ font: getComputedStyle(i).fontFamily, dir: getComputedStyle(i).direction, ...i.getBoundingClientRect().toJSON() }));
    expect(style.font).toMatch(/^"?Heebo/);
    expect(style.dir).toBe("rtl");
    expect(style.width).toBe(216);
    // the content height is Heebo's line box: within a pixel, whether the web font or a local fallback is drawn here
    expect(Math.abs(style.height - 28.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(style.y - 15.25)).toBeLessThanOrEqual(1);
  });

  // @feature PLT-028 @feature PLT-017 @feature PLT-021 @feature PLT-018 @feature PLT-010: base.html's head, as on sefaria.org (2026-11-10)
  test("the head links OpenSearch and the icons, with the app banner and theme colour (the manifest: unit-tested, same origin only)", async ({ page }) => {
    await open(page, "/texts");
    const head = page.locator("head");
    await expect(head.locator('link[rel="search"]')).toHaveAttribute("href", /\/static\/files\/opensearch\.xml$/);
    await expect(head.locator('link[rel="search"]')).toHaveAttribute("title", "Sefaria Search");
    await expect(head.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", /\/static\/icons\/library\/favicon\.svg\?v=3$/);
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("sizes", "180x180");
    await expect(head.locator('meta[name="apple-itunes-app"]')).toHaveAttribute("content", "app-id=1163273965");
    await expect(head.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#18345D");
    await expect(head.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Library");
    // one of each, also after an in-app navigation (the head is not doubled)
    await page.getByRole("banner").getByRole("link", { name: "Topics" }).first().click();
    await expect(page).toHaveURL(/\/topics$/);
    await expect(head.locator('link[rel="search"]')).toHaveCount(1);
  });

  test("a new visitor sees the cookie notice once", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en", { cookieNotice: true });
    const notice = page.getByRole("region", { name: "Cookie notice" });
    await expect(notice).toContainText("We use cookies");
    await notice.getByRole("button", { name: "OK" }).click();
    await page.reload();
    await expect(page.getByRole("region", { name: "Cookie notice" })).toHaveCount(0);
  });

  test("Escape in the text closes the panel", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.locator('[role="group"]').first().focus();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/Genesis/);
  });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("a reader has no site header; the home page has the menu with search, sections and language", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await expect(page.getByRole("banner")).toBeHidden();
    // open(), not page.goto(): a click before hydration is lost (it failed this way in CI, where the page hydrates slowly)
    await open(page, "/");
    await page.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("navigation", { name: "Mobile navigation menu" });
    for (const name of ["Texts", "Topics", "Learning Schedules", "Donate", "Get Help", "About Sefaria", "Voices on Sefaria", "Developers on Sefaria"]) await expect(menu.getByRole("link", { name })).toBeVisible();
    await expect(menu.getByRole("search")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  // @feature SHL-062 @feature SHL-074
  test("reading: the panel's own header has the menu button (not Close), Save, and display options; the menu opens the site navigation", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    const bar = page.locator("main header").first();
    await expect(bar.getByRole("button", { name: "Close this text" })).toBeHidden();
    await expect(bar.getByRole("button", { name: 'Save "Genesis 1"' })).toBeVisible();
    await bar.getByRole("button", { name: "Menu" }).click();
    const menu = page.getByRole("navigation", { name: "Mobile navigation menu" });
    await expect(menu.getByRole("link", { name: "Texts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("a real phone's text runs from x=34 to x=356 (verified with a phone User-Agent)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await open(page, "/Genesis.1?lang=he");
    const box = await page.locator('[role="group"][data-ref] p').first().boundingBox();
    expect(Math.round(box!.x)).toBe(34);
    expect(Math.round(box!.width)).toBe(322);
    await ctx.close();
  });
});


// @feature SHL-074 @feature GUI-004
test.describe("Save in the text header (signed out)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test("opens the 'Want to return to this text?' sign-up modal", async ({ page }) => {
    await open(page, "/Genesis.1?lang=en");
    await page.locator("main header").first().getByRole("button", { name: 'Save "Genesis 1"' }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Want to return to this text?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
