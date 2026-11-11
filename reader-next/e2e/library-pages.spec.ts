import { devices, expect, test, type Page, type Route } from "@playwright/test";
import { open } from "./helpers";

/**
 * The small Library pages of wave 2, lane P: New Additions (/updates), the notifications page (/notifications) and Torah Tracker
 * (/torahtracker), plus the ways out that stay (Explore and Visualizations in a new tab, D-6).
 *
 * The numbers asserted are sefaria.org's own (VERIFIED 2026-11-10 with Playwright, desktop 1280px and a phone User-Agent at 390px, in
 * English and Hebrew: /updates directly; the two signed-in pages by their old markup measured under sefaria.org's stylesheet).
 *
 * The signed-in pages need a session the server can see. The suite's dev server has none (its API is the cassette), so those tests
 * run against the read-only stand-in Django (scripts/exits-crawl.mjs --serve signs in `sessionid=exits-crawl`) and are SKIPPED
 * without it:
 *   EXITS_PORT=3270 node scripts/exits-crawl.mjs --serve
 *   E2E_PASS_THROUGH_URL=http://localhost:3270 E2E_STANDIN=1 zsh pw-start.sh <worktree> <port> e2e/library-pages.spec.ts
 * Signed out (main suite), each sends the reader to sign in and back, as Django's @login_required did.
 */

const PHONE = { viewport: { width: 390, height: 844 }, userAgent: devices["Pixel 7"].userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: devices["Pixel 7"].deviceScaleFactor };

const style = (page: Page, selector: string, props: string[]) =>
  page.locator(selector).first().evaluate((el, props) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { ...Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)])), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, props);

/**
 * A position that follows the About list's width: the list is as wide as its widest link's text (max-content, as on sefaria.org), and
 * the same Roboto/Heebo text measures differently per platform: macOS lays glyphs out at fractional advances ("Sefaria's Products" is
 * 128.34px, so "Updates" sits at x=288.34), Linux Chromium rounds each advance to a whole pixel, which made the list a fraction narrower
 * (x=287.x, CI run 42961568786) or, in Hebrew, wider (309.x). Not a fractional layout of ours: everything else is whole pixels. So these
 * x/w values, and only these, are checked to 1px.
 */
const textWide = (actual: number, expected: number, what: string) => expect(Math.abs(actual - expected), `${what}: ${actual} is ${expected} ± 1px`).toBeLessThanOrEqual(1);

const headerBottom = (page: Page) => page.getByRole("banner").evaluate((el) => Math.round(el.getBoundingClientRect().bottom));

const lang = async (page: Page, l: "english" | "hebrew") => page.context().addCookies([{ name: "interfaceLang", value: l, domain: "localhost", path: "/" }]);

// @feature LIB-022 @feature NTF-004 @feature STA-005 @feature RTE-031
test.describe("New Additions (/updates)", () => {
  test("is this client's page: the About list, 'Updates', the site's announcements, as sefaria.org lays them out", async ({ page }) => {
    await lang(page, "english");
    const res = await open(page, "/updates");
    expect(res!.headers()["x-served-by"] ?? "").not.toBe("django");
    await expect(page).toHaveTitle("New Additions to the Sefaria Library");
    const about = page.getByRole("navigation", { name: "About Sefaria" });
    await expect(about.getByRole("link")).toHaveCount(12);
    await expect(about.getByRole("link", { name: "New Additions" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Updates");
    await expect(page.locator("[data-notification]").first()).toBeVisible();
    const top = await headerBottom(page);
    // sefaria.org at 1280px: the list from x=0 (its links at 50), "Updates" at x=288, 80px under the header, 22px/500 #666
    const h1 = await style(page, "#updatesPage h1", ["font-size", "font-weight", "color", "padding-top", "margin-bottom"]);
    textWide(h1.x, 288, "'Updates' x");
    expect(h1).toMatchObject({ y: top + 80, "font-size": "22px", "font-weight": "500", color: "rgb(102, 102, 102)", "padding-top": "2px", "margin-bottom": "30px" });
    const first = await style(page, "nav[aria-label='About Sefaria'] a", ["font-size", "color"]);
    expect(first).toMatchObject({ x: 50, y: top + 86, "font-size": "16px", color: "rgb(102, 102, 102)" });
    const chip = await style(page, "nav[aria-label='About Sefaria'] a[aria-current]", ["background-color", "color", "border-radius"]);
    expect(chip).toMatchObject({ x: 45, h: 29, "background-color": "rgb(237, 237, 236)", color: "rgb(0, 0, 0)", "border-radius": "6px" });
    const row = await style(page, "[data-notification]", ["padding-top", "border-bottom-width", "border-bottom-color", "line-height"]);
    textWide(row.x, 288, "the first announcement's x");
    expect(row).toMatchObject({ y: top + 118, w: 665, "padding-top": "25px", "border-bottom-width": "1px", "border-bottom-color": "rgb(204, 204, 204)", "line-height": "22.4px" });
    const date = await style(page, "[data-notification] > div:nth-child(2) > div > div:nth-child(2)", ["font-size", "color"]);
    expect(date).toMatchObject({ "font-size": "14px", color: "rgb(111, 111, 111)" });
    await expect(page.locator("[data-notification]").first()).toContainText(/\d+ (?:second|minute|hour|day|week|month|year)s? ago/);
    // the announcement's picture is hidden on this page (s2.css .update .imageSection)
    await expect(page.locator("[data-notification] img").first()).toBeHidden();
  });

  test("Hebrew: right to left, the list on the right, the old 5px over 'עדכונים', the Hebrew dates", async ({ page }) => {
    await lang(page, "hebrew");
    await open(page, "/updates");
    await expect(page).toHaveTitle("חידושים בארון הספרים של ספריא");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("עדכונים");
    const top = await headerBottom(page);
    const h1 = await style(page, "#updatesPage h1", ["padding-top"]);
    textWide(h1.x, 310, "'עדכונים' x");
    expect(h1).toMatchObject({ y: top + 80, "padding-top": "5px" });
    const list = await style(page, "nav[aria-label='About Sefaria']", []);
    textWide(list.x, 1075, "the list's x");
    textWide(list.w, 205, "the list's width");
    const chip = await style(page, "nav[aria-label='About Sefaria'] a[aria-current]", []);
    textWide(chip.x, 1168, "the chip's x");
    expect(chip).toMatchObject({ h: 29 });
    await expect(page.locator("[data-notification]").first()).toContainText("לפני");
  });

  test("scrolling to the end reads the next ten", async ({ page }) => {
    await lang(page, "english");
    await open(page, "/updates");
    const before = await page.locator("[data-notification]").count();
    expect(before).toBeGreaterThan(0);
    const next = page.waitForRequest((r) => /\/api\/updates\?page=1$/.test(r.url()));
    await page.locator("[data-load-more]").scrollIntoViewIfNeeded();
    await next;
    await expect.poll(() => page.locator("[data-notification]").count()).toBeGreaterThan(before);
  });

  test("the account menu's New Additions opens it in the app", async ({ page }) => {
    await lang(page, "english");
    await open(page, "/texts");
    const documents: string[] = [];
    page.on("request", (r) => r.resourceType() === "document" && documents.push(r.url()));
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("dialog", { name: "Account menu" }).getByRole("link", { name: "New Additions" }).click();
    await expect(page).toHaveURL(/\/updates$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Updates");
    expect(documents).toEqual([]);
  });

  test.describe("on a phone", () => {
    test.use(PHONE);
    test("no About list (sefaria.org leaves it out for a phone), the header kept, 'Updates' 40px under it @mobile", async ({ page }) => {
      await lang(page, "english");
      await open(page, "/updates");
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "About Sefaria" })).toBeHidden();
      const top = await headerBottom(page);
      expect(await style(page, "#updatesPage h1", ["padding-top"])).toMatchObject({ x: 30, y: top + 40, "padding-top": "2px" });
      expect(await style(page, "[data-notification]", [])).toMatchObject({ x: 30 });
    });
  });
});

// @feature NTF-001 @feature PRO-010 @feature RTE-015 @feature RTE-031
test.describe("signed out", () => {
  for (const path of ["/notifications", "/torahtracker"]) {
    test(`${path} goes to sign in and back`, async ({ page }) => {
      const res = await page.request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(302);
      expect(res.headers()["location"]).toBe(`/login?next=${encodeURIComponent(path)}`);
      expect(res.headers()["x-served-by"] ?? "").not.toBe("django");
    });
  }
});

// @feature LIB-041 (D-6)
test("Visualizations open in a new tab (Explore and the visualizations stay the old site's, D-6)", async ({ page }) => {
  await lang(page, "english");
  await open(page, "/texts/Tanakh");
  const links = page.locator('a[href*="/explore"], a[href*="/visualizations"]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
  }
});

// ---------------------------------------------------------------- signed in (the stand-in Django; see the top)
const BASE = process.env.E2E_PASS_THROUGH_URL;
const STANDIN_UID = 990001;
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const DAY = 86400;
const now = () => Date.now() / 1000;

async function signedIn(page: Page, l: "english" | "hebrew") {
  const host = new URL(BASE!).hostname;
  await page.context().addCookies(
    [
      { name: "sessionid", value: "exits-crawl" },
      { name: "interfaceLang", value: l },
      { name: "cookiesNotificationAccepted", value: "1" },
      { name: "csrftoken", value: "e2e-csrf" },
    ].map((c) => ({ ...c, domain: host, path: "/" })),
  );
}

test.describe("signed in (stand-in Django)", () => {
  test.skip(!BASE || !process.env.E2E_STANDIN, "needs the stand-in Django's session (E2E_PASS_THROUGH_URL, E2E_STANDIN=1; see the top)");
  test.use({ baseURL: BASE });

  const NOTIFICATIONS = [
    { _id: "n1", type: "index", date: now() - 21 * DAY, read: false, content: { index: "Genesis", en: "The first book", he: "הספר הראשון" } },
    { _id: "n2", type: "version", date: now() - 2 * DAY, read: true, content: { index: "Exodus", version: "The Contemporary Torah", language: "en" } },
    { _id: "n3", type: "general", date: now() - 3600, read: false, content: { en: 'A new <a href="/Genesis.1">translation</a>', he: 'תרגום <a href="/Genesis.1">חדש</a>' } },
  ];

  // @feature NTF-001 @feature NTF-002 @feature NTF-003
  test("notifications: the list, everything loaded marked read with the Library scope and CSRF, links in the app", async ({ page }) => {
    await signedIn(page, "english");
    const read: { body: string; csrf?: string }[] = [];
    await page.route(/\/api\/notifications\?/, (r) => json(r, { notifications: NOTIFICATIONS, page: 0, page_size: 10, count: 3 }));
    await page.route(/\/api\/notifications\/read/, (r) => {
      read.push({ body: r.request().postData() ?? "", csrf: r.request().headers()["x-csrftoken"] });
      return json(r, { status: "ok", unreadCount: 0 });
    });
    await open(page, "/notifications");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notifications");
    await expect(page.locator("[data-notification]")).toHaveCount(3);
    await expect(page.locator("[data-notification]").first()).toContainText("New Text: Genesis");
    await expect(page.locator("[data-notification]").first()).toContainText("3 weeks ago");
    await expect(page.locator("[data-notification]").nth(1)).toContainText("New English version of Exodus: The Contemporary Torah");
    await expect.poll(() => read.length).toBe(1);
    const sent = new URLSearchParams(read[0]!.body);
    expect(JSON.parse(sent.get("notifications")!)).toEqual(["n1", "n3"]);
    expect(sent.get("scope")).toBe("library");
    expect(read[0]!.csrf).toBeTruthy();
    await expect(page).toHaveTitle("Notifications | Sefaria Library");
    // sefaria.org's stylesheet on the old markup: the title 4px down, 22px/500 #666; the bell 24px; rows 25px over a #ccc rule
    const top = await headerBottom(page);
    expect(await style(page, "h1", ["font-size", "font-weight", "color"])).toMatchObject({ y: top + 64, "font-size": "22px", "font-weight": "500", color: "rgb(102, 102, 102)" });
    expect(await style(page, "h1 img", [])).toMatchObject({ w: 24, h: 24 });
    expect(await style(page, "[data-notification]", ["padding-top", "border-bottom-color"])).toMatchObject({ y: top + 135, "padding-top": "25px", "border-bottom-color": "rgb(204, 204, 204)" });
    expect(await style(page, "[data-notification] img", ["border-radius"])).toMatchObject({ w: 30, h: 30, "border-radius": "15px" });
    // a link in an announcement opens the text in the app
    const documents: string[] = [];
    page.on("request", (r) => r.resourceType() === "document" && documents.push(r.url()));
    await page.getByRole("link", { name: "translation" }).click();
    await expect(page).toHaveURL(/\/Genesis\.1/);
    expect(documents).toEqual([]);
  });

  test("notifications: none yet is the old message; Hebrew", async ({ page }) => {
    await signedIn(page, "hebrew");
    await page.route(/\/api\/notifications\?/, (r) => json(r, { notifications: [], page: 0, page_size: 10, count: 0 }));
    await open(page, "/notifications");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("התראות");
    await expect(page.getByText("נראה שעדיין אין לך התראות")).toBeVisible();
  });

  const STATS = {
    uid: STANDIN_UID,
    name: "Exits Crawler",
    currently: { textsRead: 120, categoriesRead: { Tanakh: 60, Talmud: 30, Midrash: 6, Liturgy: 2 }, mostViewedRefs: [{ en: "Genesis 1:1", he: "בראשית א׳:א׳", book: "Genesis" }] },
    alltime: { textsRead: 2, categoriesRead: { Tanakh: 2 }, mostViewedRefs: [] },
  };
  const SITE = { currently: { categoriesRead: { Tanakh: 40, Talmud: 40, Midrash: 10, Liturgy: 10 } }, alltime: { categoriesRead: { Tanakh: 50, Talmud: 30, Midrash: 20 } } };

  // @feature PRO-010
  test("Torah Tracker from the account menu, in the app: the reader's numbers, then the site's for a quiet period", async ({ page }) => {
    await signedIn(page, "english");
    await page.route(new RegExp(`/api/user_stats/${STANDIN_UID}$`), (r) => json(r, STATS));
    await page.route(/\/api\/site_stats/, (r) => json(r, SITE));
    await open(page, "/texts");
    const documents: string[] = [];
    page.on("request", (r) => r.resourceType() === "document" && documents.push(r.url()));
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("dialog", { name: "Account menu" }).getByRole("link", { name: "Torah Tracker" }).click();
    await expect(page).toHaveURL(/\/torahtracker$/);
    expect(documents).toEqual([]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Exits Crawler");
    await expect(page).toHaveTitle("Torah Tracker | Sefaria Library");
    await expect(page.getByRole("heading", { name: "Your Overall Activity" })).toBeVisible();
    await expect(page.getByText("120", { exact: true })).toBeVisible();
    // the reader's donut: Tanakh, Talmud, Midrash and Etc (Liturgy is under 4%); the average reader's: all four and Etc
    await expect(page.locator("svg[role=img] path")).toHaveCount(4 + 5);
    await expect(page.getByText("TANAKH", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Genesis 1:1" })).toHaveAttribute("href", "/Genesis.1.1");
    // sefaria.org's stylesheet on the old markup: the name 60px down in 30px Garamond; the 240px switch; the 211px card
    const top = await headerBottom(page);
    expect(await style(page, "h1", ["font-size", "padding-top"])).toMatchObject({ y: top, "font-size": "30px", "padding-top": "60px" });
    expect(await style(page, "[role=group]", [])).toMatchObject({ y: top + 129, w: 240, h: 50 });
    expect(await style(page, "button[aria-pressed=true]", ["background-color", "color"])).toMatchObject({ w: 120, h: 50, color: "rgb(255, 255, 255)" });
    expect(await style(page, "h2", ["font-size", "color", "padding-top"])).toMatchObject({ y: top + 209, "font-size": "21px", color: "rgb(112, 112, 112)", "padding-top": "40px" });
    await page.getByRole("button", { name: "Switch to All Time mode" }).click();
    await expect(page.getByText("Looks like we haven’t seen you in a while!")).toBeVisible();
    await expect(page.getByRole("heading", { name: "What People are Reading" })).toBeVisible();
  });

  // @feature LEG-007 (T-F27): Django's editors come back to this client through ?next= (the old s1 editor goes to params.next on save
  // and on cancel), and the return forgets the edited book on disk (e2e/freshness.spec.ts covers that half)
  test("Add Translation and Edit Text send the reader to Django's editor with ?next= this page", async ({ page }) => {
    await signedIn(page, "english");
    const editors: string[] = [];
    await page.route(/\/(translate|edit)\//, (r) => {
      editors.push(r.request().url());
      return r.fulfill({ status: 200, contentType: "text/html", body: "<title>editor</title>" });
    });
    const here = "/Genesis.1.1?lang=en&with=Advanced%20Tools";
    await open(page, here);
    await page.getByRole("link", { name: "Add Translation" }).click();
    await expect.poll(() => editors.length).toBe(1);
    const translate = new URL(editors[0]!);
    expect(translate.pathname).toBe("/translate/Genesis.1.1");
    expect(new URL(translate.searchParams.get("next")!, BASE).pathname).toBe("/Genesis.1.1");
    // Edit Text needs a version that is not locked (Genesis's all are): Sefer HaChinukh's Torat Emet Hebrew
    const open2 = "/Sefer_HaChinukh.1.1?lang=he&vhe=hebrew|Sefer_HaChinukh_--_Torat_Emet&with=Advanced%20Tools";
    await open(page, open2);
    await page.getByRole("link", { name: "Edit Text" }).click();
    await expect.poll(() => editors.length).toBe(2);
    const edit = new URL(editors[1]!);
    expect(edit.pathname).toBe("/edit/Sefer_HaChinukh.1.1/hebrew/Sefer%20HaChinukh%20--%20Torat%20Emet");
    expect(new URL(edit.searchParams.get("next")!, BASE).pathname).toBe("/Sefer_HaChinukh.1.1");
  });

  test.describe("Hebrew, on a phone", () => {
    test.use(PHONE);
    test("Torah Tracker in Hebrew: Hebrew category names, bars from the right @mobile", async ({ page }) => {
      await signedIn(page, "hebrew");
      await page.route(new RegExp(`/api/user_stats/${STANDIN_UID}$`), (r) => json(r, STATS));
      await page.route(/\/api\/site_stats/, (r) => json(r, SITE));
      await open(page, "/torahtracker");
      await expect(page.getByRole("heading", { name: "הפעילות שלך במבט" })).toBeVisible();
      await expect(page.locator("svg text").filter({ hasText: /^תנ/ }).first()).toBeVisible();
      await expect(page.getByRole("banner")).toBeVisible();
    });
  });
});
