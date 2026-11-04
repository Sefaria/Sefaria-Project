import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
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
  await expect(page).toHaveTitle("Learning Schedules | Sefaria Library");
  const headings = page.locator("main h2").filter({ hasText: /^(Weekly Torah Portion|Daily Learning|Weekly Learning)$/ });
  await expect(headings).toHaveText(["Weekly Torah Portion", "Daily Learning", "Weekly Learning"]);
  for (const section of Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]) {
    const keys = await cardsAfter(page, section).evaluateAll((els) => els.map((e) => e.getAttribute("data-calendar")));
    expect(keys, section).toEqual(expectedCards(all, section));
  }
  // a schedule the page does not list is not shown, whatever the API sends
  await expect(page.locator('[data-calendar="Parashat Hashavua"]')).toHaveCount(all.some((i) => i.title.en === "Parashat Hashavua") ? 1 : 0);
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

  // Yerushalmi Yomi has no description in the old table, and none here
  if (all.some((i) => i.title.en === "Yerushalmi Yomi")) await expect(page.locator('[data-calendar="Yerushalmi Yomi"] > div')).toHaveCount(1);
  // Chok LeYisrael's reading is a Hebrew collection path, written as the API gives it
  const chok = all.find((i) => i.title.en === "Chok LeYisrael");
  if (chok) expect(await page.locator('[data-calendar="Chok LeYisrael"] a').first().getAttribute("href")).toBe(`/${chok.url}`);
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
  await expect(side.getByRole("link", { name: "Make a Donation" })).toBeVisible();
  await expect(side.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  // the phone's copy at the top of the page is not shown on a wide screen
  await expect(page.locator("main > div > div").first().getByRole("heading", { name: "Learning Schedules" })).toBeHidden();
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
});

// @feature CAL-003 @feature RTE-010
test("/parashat-hashavua and /todays-daf-yomi answer 302 to this week's portion and today's daf, ignoring ?diaspora", async ({ request, page }) => {
  const all = await items(request, "diaspora=1");
  const portion = all.find((i) => i.title.en === "Parashat Hashavua")!;
  const daf = all.find((i) => i.title.en === "Daf Yomi")!;
  for (const [path, item] of [["/parashat-hashavua", portion], ["/parashat-hashavua?diaspora=0", portion], ["/todays-daf-yomi", daf]] as const) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(302);
    expect(r.headers()["location"], path).toBe(`/${item.url}`);
    expect(r.headers()["content-type"]).toBe("text/html; charset=utf-8");
    expect(await r.text()).toBe("");
  }
  await page.goto("/todays-daf-yomi");
  await expect(page).toHaveURL(new RegExp(`/${daf.url.replace(/\./g, "\\.")}`));
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

// @feature CAL-003
test("on the Voices host the shortcuts are not answered here (Django keeps them there)", async ({ request }) => {
  const r = await request.get("/parashat-hashavua", { maxRedirects: 0, headers: { host: "voices.localhost" } });
  expect(r.status()).not.toBe(302);
});

// @feature CAL-001 @feature LIB-054 @mobile
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
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
