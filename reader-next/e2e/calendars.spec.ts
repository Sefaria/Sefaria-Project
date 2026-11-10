import { devices, expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { open } from "./helpers";

// The Learning Schedules page (/calendars) and the shortcuts /parashat-hashavua and /todays-daf-yomi, as sefaria.org has them
// (VERIFIED 2026-11-04 against www.sefaria.org: 302s, Location "/" + the calendar item's url, ?diaspora ignored; "/calendars/" a page
// of its own; "/parashat-hashavua/" a 404). Pixel parity with the live page: scripts/parity-page.mjs calendars=/calendars.
// What the page should show is read from the same API the server asked (through the e2e cassette), so the day's schedules never
// make the test stale.

const API = process.env.E2E_LIVE ? "https://www.sefaria.org" : `http://localhost:${Number(process.env.E2E_API_PORT) || 3998}`;
interface Item {
  title: { en: string; he: string };
  displayValue: { en: string; he: string };
  url: string;
  ref: string;
  heRef?: string;
  category?: string;
}
const items = async (request: APIRequestContext, query: string): Promise<Item[]> => (await (await request.get(`${API}/api/calendars?${query}`)).json()).calendar_items;

const SECTIONS = {
  "Weekly Torah Portion": ["Parashat Hashavua", "Haftarah (A)", "Haftarah (S)", "Haftarah"],
  "Daily Learning": ["Daf Yomi", "929", "Daily Mishnah", "Daily Rambam", "Daily Rambam (3 Chapters)", "Halakhah Yomit", "Arukh HaShulchan Yomi", "Tanakh Yomi", "Zohar for Elul", "Chok LeYisrael", "Tanya Yomi", "Yerushalmi Yomi"],
  "Weekly Learning": ["Daf a Week"],
};
/** The cards the old page would show in a section: the API's items of that section, in the API's order, repeated titles merged. */
const expectedCards = (all: Item[], section: keyof typeof SECTIONS) => {
  const out: string[] = [];
  for (const i of all) if ((SECTIONS[section] as string[]).includes(i.title.en) && out[out.length - 1] !== i.title.en) out.push(i.title.en);
  return out;
};
const cardsAfter = (page: Page, heading: string) =>
  page.locator("main h2", { hasText: heading }).locator("xpath=following-sibling::div[1]").locator("[data-calendar]");

// @feature CAL-001 @feature RTE-010
test("/calendars lists the day's schedules under Weekly Torah Portion, Daily Learning and Weekly Learning", async ({ page, request }) => {
  const all = await items(request, "diaspora=1&custom=ashkenazi");
  await open(page, "/calendars");
  await expect(page).toHaveTitle("Learning Schedules | The Sefaria Library");
  const headings = page.locator("main h2").filter({ hasText: /^(Weekly Torah Portion|Daily Learning|Weekly Learning)$/ });
  await expect(headings).toHaveText(["Weekly Torah Portion", "Daily Learning", "Weekly Learning"]);
  for (const section of Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]) {
    const keys = await cardsAfter(page, section).evaluateAll((els) => els.map((e) => e.getAttribute("data-calendar")));
    expect(keys, section).toEqual(expectedCards(all, section));
  }
  // the same, written out by hand rather than computed (a shared bug in section membership or order cannot pass both): the portion
  // opens the first section, Daf Yomi the second, and Daf a Week is the whole third; a schedule the page does not list never shows
  expect(await cardsAfter(page, "Weekly Torah Portion").first().getAttribute("data-calendar")).toBe("Parashat Hashavua");
  expect(await cardsAfter(page, "Daily Learning").first().getAttribute("data-calendar")).toBe("Daf Yomi");
  for (const daily of ["929", "Daily Mishnah", "Daily Rambam", "Halakhah Yomit", "Tanakh Yomi", "Yerushalmi Yomi"]) await expect(cardsAfter(page, "Daily Learning").and(page.locator(`[data-calendar="${daily}"]`)), daily).toHaveCount(1);
  await expect(cardsAfter(page, "Weekly Learning")).toHaveCount(1);
  await expect(cardsAfter(page, "Weekly Learning").first()).toHaveAttribute("data-calendar", "Daf a Week");
  await expect(page.locator("[data-calendar]")).toHaveCount(expectedCards(all, "Weekly Torah Portion").length + expectedCards(all, "Daily Learning").length + 1);
  for (const unlisted of all.map((i) => i.title.en).filter((t) => !Object.values(SECTIONS).flat().includes(t))) await expect(page.locator(`[data-calendar="${unlisted}"]`), unlisted).toHaveCount(0);
});

// @feature CAL-002
test("each card: the portion's name over its ref, schedule names with (Talmud)/(Tanakh), every reading linked, the description", async ({ page, request }) => {
  const all = await items(request, "diaspora=1&custom=ashkenazi");
  await open(page, "/calendars");
  const portion = all.find((i) => i.title.en === "Parashat Hashavua")!;
  const p = page.locator('[data-calendar="Parashat Hashavua"]');
  await expect(p.getByRole("link").first()).toHaveText(portion.displayValue.en);
  await expect(p.getByRole("link").first()).toHaveAttribute("href", `/${portion.url}`);
  await expect(p.getByRole("link").nth(1)).toHaveText(portion.ref);
  await expect(p.getByRole("img", { name: "book icon" })).toBeVisible();

  const daf = all.find((i) => i.title.en === "Daf Yomi")!;
  const d = page.locator('[data-calendar="Daf Yomi"]');
  // the brackets are drawn by CSS, as the old page's ::before/::after
  await expect(d.getByRole("link").first()).toHaveText("Daf YomiTalmud");
  expect(await d.locator("a").first().evaluate((a) => getComputedStyle(a.lastElementChild!.querySelector("span") ?? a.lastElementChild!, "::before").content)).toBe('"("');
  await expect(d.getByRole("link", { name: daf.displayValue.en })).toHaveAttribute("href", `/${daf.url}`);
  await expect(d.getByText(/covers a page of Talmud a day/)).toBeVisible();
  // the line over the card is the category's colour (Talmud gold), 4px
  expect(await d.evaluate((e) => getComputedStyle(e).borderTopWidth + " " + getComputedStyle(e).borderTopColor)).toBe("4px rgb(204, 180, 121)");

  // Yerushalmi Yomi has no description in the old table, and none here (the API sends it every day: its absence is a failure)
  expect(all.some((i) => i.title.en === "Yerushalmi Yomi"), "the API's Yerushalmi Yomi").toBe(true);
  await expect(page.locator('[data-calendar="Yerushalmi Yomi"] > div')).toHaveCount(1);
  await expect(page.locator('[data-calendar="Yerushalmi Yomi"] > a')).toHaveCount(1);
  // Chok LeYisrael's reading is a Hebrew collection path, written as the API gives it (unencoded)
  const chok = all.find((i) => i.title.en === "Chok LeYisrael");
  expect(chok, "the API's Chok LeYisrael").toBeTruthy();
  const chokHref = await page.locator('[data-calendar="Chok LeYisrael"] a').first().getAttribute("href");
  expect(chokHref).toBe(`/${chok!.url}`);
  expect(chokHref).toMatch(/[\u0590-\u05FF]/);
});

// @feature CAL-002 @feature CAL-001
test("following a card opens the reading in the reader; Back returns to the schedules, Forward to the reading", async ({ page, request }) => {
  const all = await items(request, "diaspora=1&custom=ashkenazi");
  const daf = all.find((i) => i.title.en === "Daf Yomi")!;
  await open(page, "/calendars");
  // as the old app: the whole trip stays in one document (no full page load)
  await page.evaluate(() => ((window as unknown as { __sameDoc: boolean }).__sameDoc = true));
  const sameDoc = () => page.evaluate(() => (window as unknown as { __sameDoc?: boolean }).__sameDoc === true);
  await page.locator('[data-calendar="Daf Yomi"]').getByRole("link", { name: daf.displayValue.en }).click();
  // a daf without its amud is written as both amudim once the reader has it, as on sefaria.org (/Berakhot.2 → /Berakhot.2a.1-2b.19;
  // lane D, owner decision 2026-11-10, e2e/ranges.spec.ts)
  const at = new RegExp(`/${dafAddress(daf.url)}(\\?|$)`);
  await expect(page).toHaveURL(at);
  // the reader shows the daf: its title in the reader's header and text in the column
  await expect(page.locator("[data-reader-scroller]")).toBeVisible();
  await expect(page.getByRole("heading").filter({ hasText: daf.displayValue.en.split(" ")[0]! }).first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/calendars$/);
  await expect(page.locator("main h2", { hasText: "Daily Learning" })).toBeVisible();
  await expect(page.locator('[data-calendar="Daf Yomi"]')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(at);
  await expect(page.locator("[data-reader-scroller]")).toBeVisible();
  expect(await sameDoc(), "the card, Back and Forward stayed in the same document").toBe(true);
});

// @feature CAL-001 @feature RTE-010
test("once loaded, the address becomes /calendars (no slash, no query; the hash stays) and the tab title the app's own", async ({ page, context }) => {
  await open(page, "/calendars/?foo=1#x");
  await expect(page).toHaveURL(/\/calendars#x$/);
  await expect(page).toHaveTitle("Learning Schedules | The Sefaria Library");
  await open(page, "/calendars/");
  await expect(page).toHaveURL(/\/calendars$/);
  await context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
  await open(page, "/calendars");
  await expect(page).toHaveTitle("לוח לימוד יומי | האוסף של ספריא");
});

// @feature CAL-002
test("two columns of cards beside the sidebar on a wide screen, 10px apart", async ({ page }) => {
  await open(page, "/calendars");
  const cards = page.locator("[data-calendar]");
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.round(a!.y)).toBe(Math.round(b!.y));
  expect(Math.round(b!.x - (a!.x + a!.width))).toBe(10);
  expect(Math.round(a!.width)).toBe(328);
});

// @feature LIB-054 @feature LIB-050 @feature LIB-033 @feature LIB-031
test("the sidebar: About Learning Schedules, Stay Connected, Support Sefaria, then the footer", async ({ page }) => {
  await open(page, "/calendars");
  const side = page.getByRole("complementary");
  await expect(side.getByRole("heading")).toHaveText(["Learning Schedules", "Stay Connected", "Support Sefaria"]);
  await expect(side.getByText(/Since biblical times, the Torah has been divided/)).toBeVisible();
  await expect(side.getByRole("button", { name: "Sefaria on Facebook" })).toHaveAttribute("href", "https://www.facebook.com/sefaria.org");
  await expect(side.getByRole("button", { name: "Sefaria on Instagram" })).toHaveAttribute("href", "https://www.instagram.com/sefariaproject");
  await expect(side.getByRole("button", { name: "Sefaria on YouTube" })).toHaveAttribute("href", "https://www.youtube.com/user/SefariaProject");
  await expect(side.getByRole("link", { name: "Make a Donation" })).toHaveAttribute("href", "https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=NavSidebar-SupportSefaria");
  await expect(side.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  // the phone's copy at the top of the page is not shown on a wide screen
  await expect(page.locator("main > div > div").first().getByRole("heading", { name: "Learning Schedules" })).toBeHidden();
  // the arrow and the heart keep the old images' alt texts
  await expect(side.getByRole("img", { name: "Submit" })).toBeVisible();
  await expect(side.getByRole("img", { name: "donation icon" })).toBeVisible();
});

// @feature CAL-001 @feature RTE-010 @feature LIB-038
test("the site's ways in: /texts' All Learning Schedules and the phone menu's Learning Schedules write /calendars and open this page", async ({ page }) => {
  await open(page, "/texts");
  const all = page.getByRole("link", { name: "All Learning Schedules ›" });
  await expect(all).toHaveAttribute("href", "/calendars");
  await expect(page.locator('#mobile-nav a:has-text("Learning Schedules")')).toHaveAttribute("href", "/calendars");
  await all.click();
  await expect(page).toHaveURL(/\/calendars$/);
  await page.waitForSelector("html[data-hydrated='true']");
  await expect(page).toHaveTitle("Learning Schedules | The Sefaria Library");
  await expect(page.locator("main h2", { hasText: "Weekly Torah Portion" })).toBeVisible();
});

// @feature CAL-001
test("analytics: the page keeps the old panel's data-anl-batch (bilingual in English, hebrew in the Hebrew interface)", async ({ page, context }) => {
  await open(page, "/calendars");
  await expect(page.locator("[data-anl-batch]")).toHaveAttribute("data-anl-batch", '{"panel_number":1,"content_lang":"bilingual"}');
  await context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
  await open(page, "/calendars");
  await expect(page.locator("[data-anl-batch]")).toHaveAttribute("data-anl-batch", '{"panel_number":1,"content_lang":"hebrew"}');
});

// @feature CAL-001
test("the head: title, description, canonical, Open Graph / Twitter cards and the hreflang alternates, as sefaria.org's", async ({ request }) => {
  const html = await (await request.get("/calendars")).text();
  for (const tag of [
    '<meta property="og:title" content="Learning Schedules | Sefaria Library"',
    '<meta name="twitter:card" content="summary_large_image"',
    '<meta name="twitter:site" content="@sefariaproject"',
    '<meta property="og:type" content="website"',
    '<meta property="og:url" content="https://www.sefaria.org/calendars"',
    '<meta property="og:image" content="https://www.sefaria.org/api/img-gen/calendars?lang=&amp;platform=facebook&amp;ven=&amp;vhe="',
    '<meta name="twitter:image" content="https://www.sefaria.org/api/img-gen/calendars?lang=&amp;platform=twitter&amp;ven=&amp;vhe="',
    // React writes the attribute "hrefLang": HTML attribute names are case-insensitive, so it is the same hreflang
    '<link rel="alternate" href="https://www.sefaria.org/calendars" hreflang="en"',
    '<link rel="alternate" href="https://www.sefaria.org.il/calendars" hreflang="he"',
  ]) expect(html.replace(/hrefLang=/g, "hreflang="), tag).toContain(tag);
});

// @feature PRM-016 @feature LIB-050
test("newsletter: a bad address is refused, a good one asks for names, then subscribes (POST mocked) and is counted", async ({ page, context }) => {
  await context.addCookies([{ name: "csrftoken", value: "test-token", domain: "localhost", path: "/" }]);
  const posts: { url: string; body: unknown; csrf?: string }[] = [];
  await page.route("**/api/subscribe/**", async (r) => {
    posts.push({ url: r.request().url(), body: r.request().postDataJSON(), csrf: r.request().headers()["x-csrftoken"] });
    await r.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
  });
  await open(page, "/calendars");
  const side = page.getByRole("complementary");
  const email = side.getByRole("textbox", { name: "Email address" });
  await expect(email).toHaveAttribute("placeholder", "Sign up for Newsletter");
  await email.fill("not-an-email");
  await email.press("Enter");
  await expect(side.getByText("Please enter a valid email address.")).toBeVisible();
  await email.fill("reader@example.com");
  await side.getByRole("button", { name: "Submit" }).click();
  await expect(side.getByRole("textbox", { name: "First Name" })).toBeFocused();
  await side.getByRole("button", { name: "Submit" }).click();
  await expect(side.getByText("Please enter a valid first and last name")).toBeVisible();
  await side.getByRole("textbox", { name: "First Name" }).fill("Ada");
  await side.getByRole("textbox", { name: "Last Name" }).fill("Lovelace");
  await side.getByLabel("I am an educator").check();
  await side.getByRole("textbox", { name: "Last Name" }).press("Enter");
  await expect(side.getByText("Subscribed! Welcome to our list.")).toBeVisible();
  await expect(email).toBeDisabled();
  expect(posts).toEqual([{ url: expect.stringMatching(/\/api\/subscribe\/reader@example\.com$/), body: { language: "en", educator: true, firstName: "Ada", lastName: "Lovelace" }, csrf: "test-token" }]);
  // the old event, with the old sidebar's missing context name
  const log = await page.evaluate(() => (window as unknown as { __SEFARIA_ANALYTICS__: { channel: string; name: string }[] }).__SEFARIA_ANALYTICS__);
  expect(log.some((e) => e.channel === "ua" && e.name === "Newsletter|Subscribe from undefined")).toBe(true);
});

// @feature PRM-016
test("newsletter: Django's error is shown and the names close again", async ({ page, context }) => {
  await context.addCookies([{ name: "csrftoken", value: "test-token", domain: "localhost", path: "/" }]);
  await page.route("**/api/subscribe/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ error: "Sorry, that address is blocked." }) }));
  await open(page, "/calendars");
  const side = page.getByRole("complementary");
  await side.getByRole("textbox", { name: "Email address" }).fill("reader@example.com");
  await side.getByRole("textbox", { name: "Email address" }).press("Enter");
  await side.getByRole("textbox", { name: "First Name" }).fill("Ada");
  await side.getByRole("textbox", { name: "Last Name" }).fill("Lovelace");
  await side.getByRole("textbox", { name: "Last Name" }).press("Enter");
  await expect(side.getByText("Sorry, that address is blocked.")).toBeVisible();
  await expect(side.getByRole("textbox", { name: "First Name" })).toHaveCount(0);
});

// @feature CAL-001 @feature CAL-004
test("a reader in Israel (CF-IPCountry IL) gets the Israel schedules", async ({ browser, request }) => {
  const israel = await items(request, "diaspora=0&custom=ashkenazi");
  const ctx = await browser.newContext({ extraHTTPHeaders: { "cf-ipcountry": "IL" } });
  const page = await ctx.newPage();
  await open(page, "/calendars");
  expect(await page.evaluate(() => (window as unknown as { __SEFARIA_REQUEST__: { diaspora: boolean } }).__SEFARIA_REQUEST__.diaspora)).toBe(false);
  const portion = israel.find((i) => i.title.en === "Parashat Hashavua")!;
  await expect(page.locator('[data-calendar="Parashat Hashavua"] a').first()).toHaveAttribute("href", `/${portion.url}`);
  const keys = await cardsAfter(page, "Weekly Torah Portion").evaluateAll((els) => els.map((e) => e.getAttribute("data-calendar")));
  expect(keys).toEqual(expectedCards(israel, "Weekly Torah Portion"));
  // most weeks Israel and the diaspora read the same portion, so the cards alone cannot tell them apart: the server render's query
  // cache says which schedules were asked for (Israel's), and a diaspora reader's says the other
  const html = await (await ctx.request.get("/calendars")).text();
  expect(html).toMatch(/\\?"calendars\\?",\\?"israel\\?"/);
  expect(html).not.toMatch(/\\?"calendars\\?",\\?"diaspora\\?"/);
  const diasporaHtml = await (await request.get("/calendars")).text();
  expect(diasporaHtml).toMatch(/\\?"calendars\\?",\\?"diaspora\\?"/);
  await ctx.close();
});

// @feature CAL-001 @feature I18-013
test("Hebrew interface: Hebrew headings and titles, no (Talmud), cards laid out right to left", async ({ page, context, request }) => {
  const all = await items(request, "diaspora=1&custom=ashkenazi");
  await context.addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
  await open(page, "/calendars");
  await expect(page.locator("main h2").filter({ hasText: /^(פרשת השבוע|לימוד יומי|לימוד שבועי)$/ })).toHaveText(["פרשת השבוע", "לימוד יומי", "לימוד שבועי"]);
  const daf = all.find((i) => i.title.en === "Daf Yomi")!;
  const d = page.locator('[data-calendar="Daf Yomi"]');
  await expect(d.getByRole("link").first()).toHaveText(daf.title.he);
  await expect(d.getByRole("link", { name: daf.displayValue.he })).toBeVisible();
  await expect(d.getByRole("img", { name: "סמל ספר" })).toBeVisible();
  // the first card is on the right, its title right-aligned in a right-to-left row
  const cards = page.locator("[data-calendar]");
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(a!.x).toBeGreaterThan(b!.x);
  expect(await d.locator("a").first().evaluate((e) => getComputedStyle(e).direction)).toBe("rtl");
  const side = page.getByRole("complementary");
  await expect(side.getByRole("heading")).toHaveText(["לוח לימוד יומי", "הישארו מעודכנים", "תמכו בספריא"]);
  await expect(side.getByRole("button", { name: "ספריא בפייסבוק" })).toHaveAttribute("href", "https://www.facebook.com/sefaria.org.il");
  await expect(side.getByRole("textbox", { name: "כתובת אימייל" })).toHaveAttribute("placeholder", "הרשמו לניוזלטר");
  // the Hebrew interface's donation campaign, in the module and the footer
  await expect(side.getByRole("link", { name: "לתרומה" })).toHaveAttribute("href", "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=NavSidebar-SupportSefaria");
  await expect(side.getByRole("link", { name: "תרומות" })).toHaveAttribute("href", "https://donate.sefaria.org/give/468442/#!/donation/checkout?c_src=Footer");
});

/** "Bekhorot.53" as an address pattern: as asked, or as both amudim written by their segments ("Bekhorot.53a.1-53b.17"). */
function dafAddress(url: string): string {
  const esc = url.replace(/[.?*+()[\]]/g, "\\$&");
  const n = /\.(\d+)$/.exec(url)?.[1];
  return n ? `${esc}(?:a\\.1-${n}b\\.\\d+)?` : esc;
}

// @feature CAL-003 @feature RTE-010
test("/parashat-hashavua and /todays-daf-yomi answer 302 to this week's portion and today's daf, ignoring ?diaspora", async ({ request, page }) => {
  const all = await items(request, "diaspora=1");
  // the old views keyed the items by title, so a repeated title goes to its LAST item (src/lib/library/calendars.test.ts covers it)
  const last = (t: string) => [...all].reverse().find((i) => i.title.en === t)!;
  const portion = last("Parashat Hashavua");
  const daf = last("Daf Yomi");
  for (const [path, item] of [["/parashat-hashavua", portion], ["/parashat-hashavua?diaspora=0", portion], ["/todays-daf-yomi", daf]] as const) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(302);
    expect(r.headers()["location"], path).toBe(`/${item.url}`);
    expect(r.headers()["content-type"]).toBe("text/html; charset=utf-8");
    expect(await r.text()).toBe("");
  }
  await page.goto("/todays-daf-yomi");
  await expect(page).toHaveURL(new RegExp(`/${dafAddress(daf.url)}(\\?|$)`)); // written as both amudim, as on sefaria.org
  await page.waitForSelector("html[data-hydrated='true']");
  // the reader renders today's daf (not a 404 or an error page)
  await expect(page.locator("[data-reader-scroller]")).toBeVisible();
  await expect(page.getByText(/Page not found|Something went wrong/)).toHaveCount(0);
});

// @feature CAL-003 @feature RTE-010
test("the shortcuts with a slash are not redirects (404, as sefaria.org); /calendars/ is a page with its own canonical", async ({ request }) => {
  for (const path of ["/parashat-hashavua/", "/todays-daf-yomi/"]) expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  const r = await request.get("/calendars/", { maxRedirects: 0 });
  expect(r.status()).toBe(200);
  const html = await r.text();
  expect(html).toContain('rel="canonical" href="https://www.sefaria.org/calendars/"');
  expect(await (await request.get("/calendars")).text()).toContain('rel="canonical" href="https://www.sefaria.org/calendars"');
});

// @feature CAL-001 @feature CAL-003
test("on the Voices host /calendars and the shortcuts are not this client's: a 404 as voices.sefaria.org (Django's, when passing through)", async ({ request }) => {
  for (const path of ["/calendars", "/calendars/", "/parashat-hashavua", "/todays-daf-yomi"]) {
    const r = await request.get(path, { maxRedirects: 0, headers: { host: "voices.localhost" } });
    // e2e runs without Django (pass-through off): the server answers what voices.sefaria.org does; with pass-through on it is
    // Django's own answer (x-served-by: django). Never the Library page or a redirect.
    expect(r.status(), path).toBe(404);
    expect(["reader-voices-404", "django"], path).toContain(r.headers()["x-served-by"]);
    expect(await r.text(), path).not.toContain("Weekly Torah Portion");
  }
  // the Library host still renders the page
  expect((await request.get("/calendars")).status()).toBe(200);
});

// @feature CAL-001 @feature LIB-054 @mobile
test.describe("phone", () => {
  // a phone's User-Agent too, not only its width: sefaria.org picks its single-panel layout from the UA
  test.use({ viewport: { width: 390, height: 844 }, userAgent: devices["Pixel 7"].userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: devices["Pixel 7"].deviceScaleFactor });
  test("About Learning Schedules opens the page, the cards are one column, the sidebar follows with Stay Connected @mobile", async ({ page }) => {
    await open(page, "/calendars");
    const main = page.locator("main");
    const about = main.getByRole("heading", { name: "Learning Schedules" }).first();
    await expect(about).toBeVisible();
    const first = main.locator("h2", { hasText: "Weekly Torah Portion" });
    expect((await about.boundingBox())!.y).toBeLessThan((await first.boundingBox())!.y);
    const cards = page.locator("[data-calendar]");
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(Math.round(a!.x)).toBe(Math.round(b!.x));
    expect(Math.round(b!.y - (a!.y + a!.height))).toBe(6);
    await expect(page.getByRole("complementary").getByRole("heading")).toHaveText(["Stay Connected", "Support Sefaria"]);
  });
});
