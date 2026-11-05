import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const main = (page: Page) => page.getByRole("main");
const side = (page: Page) => page.getByRole("complementary", { name: "Sidebar navigation" });

/** sefaria.org picks the single panel from the User-Agent: the phone tests send a phone's. */
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" };
/** The API the app under test reads (the cassette, or sefaria.org with E2E_LIVE). */
const API = process.env.E2E_LIVE ? "https://www.sefaria.org" : `http://localhost:${Number(process.env.E2E_API_PORT) || 3998}`;
const fontOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).fontFamily);

// @feature TOP-001 @feature TOP-002 @feature TOP-003
test.describe("/topics: Explore by Topic (verified against sefaria.org 2026-11-04)", () => {
  test("the page's sections in order, and its sidebar: Browse Topics, Trending Topics, All Topics A-Z", async ({ page }) => {
    await open(page, "/topics");
    await expect(page).toHaveTitle("Topics | The Sefaria Library");
    await expect(main(page).getByRole("heading", { level: 1, name: "Explore by Topic" })).toBeVisible();
    // the order of the old TopicsLandingPage: search, cloud, featured, newsletter, cards, portion beside the calendar
    const column = main(page).getByRole("heading", { level: 1 }).locator("..");
    const order = await column.locator("[data-anl-feature_name]").evaluateAll((els) => els.map((e) => e.getAttribute("data-anl-feature_name")));
    expect(order).toEqual(["Search", "Topic Salad", "Featured Topic", "Multi-Cards", "Parashah", "Calendar"]);
    // the whole page reports as the old panel did
    const frame = page.locator('[data-anl-project="topics"]');
    await expect(frame).toHaveAttribute("data-anl-panel_type", "Topic Landing");
    await expect(frame).toHaveAttribute("data-anl-panel_name", "Explore by Topic");

    const browse = side(page).locator('[data-anl-feature_name="Browse Topics"]');
    await expect(browse.getByRole("heading", { name: "Browse Topics" })).toBeVisible();
    const cats = browse.getByRole("link");
    await expect(cats).toHaveCount(15);
    await expect(cats.first()).toHaveText("Jewish Calendar");
    await expect(cats.first()).toHaveAttribute("href", "/topics/category/jewish-calendar2");
    await expect(cats.last()).toHaveText("Arts and Culture");
    await expect(side(page).getByRole("heading", { name: "Trending Topics" })).toBeVisible();
    await expect(side(page).locator('[data-anl-feature_name="Trending"] a')).toHaveCount(10);
    await expect(side(page).getByRole("link", { name: "All Topics A-Z ›" })).toHaveAttribute("href", "/topics/all/a");
  });

  test("a category in Browse Topics opens its page in the app; All Topics A-Z opens the index", async ({ page }) => {
    await open(page, "/topics");
    await side(page).getByRole("link", { name: "Torah Portions", exact: true }).click();
    await expect(page).toHaveURL(/\/topics\/category\/torah-portions$/);
    await expect(main(page).getByRole("heading", { level: 1, name: "Torah Portions" })).toBeVisible();
    await page.goBack();
    await side(page).getByRole("link", { name: "All Topics A-Z ›" }).click();
    await expect(page).toHaveURL(/\/topics\/all\/a$/);
    await expect(main(page).getByRole("heading", { level: 1, name: "All Topics" })).toBeVisible();
  });
});

// @feature TOP-004
test.describe("the topic search", () => {
  test("'Search N Topics A-Z'; suggestions after two letters with their category path; Enter opens the first", async ({ page }) => {
    await open(page, "/topics");
    const box = main(page).getByRole("combobox");
    await expect(box).toHaveAttribute("placeholder", /^Search [\d,]+ Topics A-Z$/);
    await expect(box).toHaveAttribute("maxlength", "75");
    await box.fill("s");
    await expect(main(page).getByRole("option")).toHaveCount(0);
    await box.fill("shabb");
    const options = main(page).getByRole("option");
    await expect(options.first()).toContainText("Shabbat", { timeout: 15_000 });
    // the category path in grey after the title, from the topics TOC
    await expect(options.filter({ hasText: /^Shabbat\s+\(Jewish Calendar\)$/ })).toHaveCount(1);
    await expect(options.first().getByRole("img", { name: "Topic" })).toHaveAttribute("src", "/icons/iconmonstr-hashtag-1.svg");
    const first = await options.first().getAttribute("data-anl-text");
    await box.press("Enter");
    // the topic page is this client's (since the topic page port): it opens in the app, then writes ?tab= (no sort from the landing),
    // as sefaria.org (VERIFIED 2026-11-05)
    await expect(page).toHaveURL(new RegExp(`/topics/${first!.toLowerCase().replace(/\s+/g, "-")}\\?tab=[a-z-]+$`));
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText(first!);
  });

  test("arrow keys move the highlight; a click opens that topic", async ({ page }) => {
    await open(page, "/topics");
    const box = main(page).getByRole("combobox");
    await box.fill("shabb");
    const options = main(page).getByRole("option");
    await expect(options.nth(1)).toBeVisible({ timeout: 15_000 });
    await box.press("ArrowDown");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    await box.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await options.nth(1).click();
    await expect(page).toHaveURL(/\/topics\/[a-z0-9-]+\?tab=[a-z-]+$/);
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText(/Shabbat|Shabb/);
  });
});

// @feature TOP-005
test.describe("the topic cloud", () => {
  // sefaria.org places its bullets once, when the sample arrives (often before the web fonts): 1–2 of its ~40 can then end a line.
  // The rule on the final lines is what it shows otherwise (measured over four loads, 2026-11-04) and what this client keeps.
  test("fifty topics in five centred lines between two rainbow lines; bullets only between items on the same line", async ({ page }) => {
    await open(page, "/topics");
    const cloud = main(page).locator('[data-anl-feature_name="Topic Salad"]');
    const items = cloud.locator('a[data-anl-event="navto_topic:click"]');
    await expect(items).toHaveCount(50);
    await expect(items.first()).toHaveAttribute("href", /^https?:\/\/[^/]+\/topics\/[^/]+$|^\/topics\/[^/]+$/);
    await expect(items.first()).toHaveAttribute("data-anl-link_type", "topic");
    // what is shown is clamped to five 40px lines
    const height = await cloud.locator("[data-salad-item]").first().evaluate((el) => el.parentElement!.parentElement!.getBoundingClientRect().height);
    expect(height).toBe(200);
    // a bullet follows an item only when the next item is on its line
    const bad = await cloud.locator("[data-salad-item]").evaluateAll((els) =>
      els.slice(0, -1).filter((el, i) => el.hasAttribute("data-bullet") !== ((el as HTMLElement).offsetTop === (els[i + 1] as HTMLElement).offsetTop)).length,
    );
    expect(bad).toBe(0);
    // and there are bullets: the cloud is not one item per line
    expect(await cloud.locator("[data-salad-item][data-bullet]").count()).toBeGreaterThan(20);
    expect(await cloud.locator("[data-salad-item]").last().getAttribute("data-bullet")).toBeNull();
  });
});

// @feature TOP-006 @feature TOP-008
test.describe("featured topic and random cards", () => {
  test("Featured Topic: picture, title, description and 'Go to Topic ›' to its page", async ({ page }) => {
    await open(page, "/topics");
    const featured = main(page).locator('[data-anl-feature_name="Featured Topic"]');
    await expect(featured.getByRole("heading", { level: 2 })).toHaveText(/featured topic/i);
    // the day's featured topic, as the server names it
    const { topic: today } = (await (await page.request.get(`${API}/_api/topics/featured-topic?lang=en`)).json()) as { topic: { slug: string; primaryTitle: { en: string } } };
    await expect(featured.getByRole("heading", { level: 3 })).toHaveText(today.primaryTitle.en);
    await expect(featured.getByRole("img")).toBeVisible();
    const go = featured.getByRole("link", { name: "Go to Topic ›" });
    await expect(go).toHaveAttribute("href", `/topics/${today.slug}`);
    // the image is 239px wide with its hairline, the text 30px beside it (measured)
    const [img, h3] = [await featured.getByRole("img").boundingBox(), await featured.getByRole("heading", { level: 3 }).boundingBox()];
    expect(Math.round(img!.width)).toBe(241);
    expect(Math.round(h3!.x - img!.x)).toBe(269);
  });

  test("three cards with a description and 'Explore <title> ›', all the same height", async ({ page }) => {
    await open(page, "/topics");
    const cards = main(page).locator('[data-anl-feature_name="Multi-Cards"] > div');
    await expect(cards).toHaveCount(3, { timeout: 15_000 });
    for (let i = 0; i < 3; i++) {
      const title = await cards.nth(i).locator("a").first().innerText();
      await expect(cards.nth(i).getByRole("link", { name: `Explore ${title} ›` })).toBeVisible();
      expect(Math.round((await cards.nth(i).locator("> div").boundingBox())!.height)).toBe(361);
    }
  });
});

// @feature TOP-007
test.describe("the topics newsletter", () => {
  test("checks the names and the address, then subscribes to the weekly topics list (the request is answered here)", async ({ page }) => {
    let sent: unknown = null;
    await page.route(/\/api\/subscribe\//, async (r) => {
      sent = { url: new URL(r.request().url()).pathname, body: r.request().postDataJSON(), csrf: r.request().headers()["x-csrftoken"] };
      await r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await open(page, "/topics");
    const form = main(page).locator('[data-anl-batch*="newsletter_topics"]');
    await expect(form.getByRole("heading", { level: 3 })).toHaveText("Stay curious. Get the Timeless Topics newsletter every Tuesday.");
    await form.getByRole("button", { name: "Sign Up" }).click();
    await expect(form.getByRole("status")).toHaveText("Please enter a valid first and last name.");
    await form.getByLabel("First Name").fill("Ada");
    await form.getByLabel("Last Name").fill("Lovelace");
    await form.getByLabel("Email Address").fill("not-an-email");
    await form.getByLabel("Email Address").press("Enter");
    await expect(form.getByRole("status")).toHaveText("Please enter a valid email address.");
    await form.getByLabel("Email Address").fill("ada@example.com");
    await form.getByRole("button", { name: "Sign Up" }).click();
    await expect(form.getByRole("status")).toHaveText("Subscribed! Welcome to our list.");
    expect(sent).toMatchObject({ url: "/api/subscribe/ada@example.com", body: { language: "en", educator: false, firstName: "Ada", lastName: "Lovelace", lists: ["Weekly Topics Newsletter"] } });
    // the analytics batch of the old form
    const batch = JSON.parse((await form.getAttribute("data-anl-batch"))!);
    expect(batch).toEqual({ text: "Stay curious. Get the Timeless Topics newsletter every Tuesday.", feature_name: "Newsletter Signup Form", version: "en", form_name: "newsletter_topics", form_destination: "Weekly Topics Newsletter" });
  });

  test("an error from the server shows under the box", async ({ page }) => {
    await page.route(/\/api\/subscribe\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ error: "Sorry, that address is blocked." }) }));
    await open(page, "/topics");
    const form = main(page).locator('[data-anl-batch*="newsletter_topics"]');
    await form.getByLabel("First Name").fill("Ada");
    await form.getByLabel("Last Name").fill("Lovelace");
    await form.getByLabel("Email Address").fill("ada@example.com");
    await form.getByRole("button", { name: "Sign Up" }).click();
    await expect(form.getByRole("alert")).toHaveText("Sorry, that address is blocked.");
  });
});

// @feature TOP-009 @feature TOP-010
test.describe("this week's portion and the Jewish calendar", () => {
  test("the portion's card, its reading, Read the Portion and Browse All Torah Portions", async ({ page }) => {
    await open(page, "/topics");
    const p = main(page).locator('[data-anl-feature_name="Parashah"]');
    await expect(p.getByText("This Week’s Torah Portion")).toBeVisible();
    const name = await p.locator("a").first().innerText();
    await expect(p.getByRole("link", { name: `Learn More about ${name} ›` })).toHaveAttribute("href", /\/topics\/parashat-[a-z-]+$/);
    const read = p.getByRole("link", { name: "Read the Portion" });
    await expect(read).toHaveAttribute("href", /^\/[A-Z][a-z]+\.\d+\.\d+-\d+\.\d+$/);
    await expect(p.getByRole("img", { name: "book icon" })).toBeVisible();
    await p.getByRole("link", { name: "Browse All Torah Portions" }).click();
    await expect(page).toHaveURL(/\/topics\/category\/torah-portions$/);
  });

  test("On the Jewish Calendar: the seasonal topic, Learn more, and Explore the Jewish Calendar", async ({ page }) => {
    await open(page, "/topics");
    const s = main(page).locator('[data-anl-feature_name="Calendar"]');
    await expect(s.getByText("On the Jewish Calendar")).toBeVisible();
    const name = await s.locator("a").first().innerText();
    await expect(s.getByRole("link", { name: `Learn more about ${name} ›` })).toHaveAttribute("href", /\/topics\/[^/]+$/);
    await s.getByRole("link", { name: "Explore the Jewish Calendar" }).click();
    await expect(page).toHaveURL(/\/topics\/category\/jewish-calendar2$/);
    await expect(main(page).getByRole("heading", { level: 1, name: "Jewish Calendar" })).toBeVisible();
  });
});

// @feature TOP-003 @feature TOP-005 @feature TOP-004
test.describe("the landing page on a phone", () => {
  test.use(PHONE);
  test("one scrolling row of blue topic pills; 'Explore all Topics ›' scrolls to Browse Topics; ten cards in a row", async ({ page }) => {
    await open(page, "/topics");
    const cloud = main(page).locator('[data-anl-feature_name="Topic Salad"]');
    const pills = cloud.locator('a[data-anl-event="navto_topic:click"]');
    await expect(pills).toHaveCount(50);
    const tops = await pills.evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
    expect(tops).toBe(1);
    expect(await pills.first().evaluate((e) => getComputedStyle(e.parentElement!).backgroundColor)).toBe("rgb(24, 52, 93)");
    await expect(main(page).locator('[data-anl-feature_name="Multi-Cards"] > div')).toHaveCount(10, { timeout: 30_000 });
    const explore = main(page).getByRole("button", { name: "Explore all Topics ›" });
    await expect(explore).toBeVisible();
    await explore.click();
    await expect.poll(async () => page.locator("#browseTopics").evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBeLessThan(200);
  });
});

// @feature TOP-003 @feature I18-013
test.describe("the landing page in the Hebrew interface", () => {
  test("Hebrew titles, placeholder and sidebar, laid out right to left", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/topics");
    await expect(page).toHaveTitle("נושאים | האוסף של ספריא");
    await expect(main(page).getByRole("heading", { level: 1, name: "למדו לפי נושא" })).toBeVisible();
    await expect(main(page).getByRole("combobox")).toHaveAttribute("placeholder", "חיפוש לפי נושא");
    const nav = page.getByRole("complementary").first();
    await expect(nav.getByRole("heading", { name: "לדפדוף במגוון נושאים" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "מועדי השנה" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "כל הנושאים מא׳ עד ת׳ ›" })).toBeVisible();
    // the sidebar sits on the left in Hebrew, the column on the right
    const [m, s] = [await main(page).locator("h1").boundingBox(), await nav.getByRole("heading", { name: "לדפדוף במגוון נושאים" }).boundingBox()];
    expect(s!.x).toBeLessThan(m!.x);
    await expect(main(page).getByText("פרשת השבוע", { exact: true })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "קראו את הפרשה" })).toBeVisible();
    // the faces sefaria.org.il uses (measured 2026-11-04): the search in Heebo, a Hebrew featured description in the Hebrew serif,
    // the Sign Up button in the English sans, the portion's links on a serif line
    expect(await fontOf(page, 'main [role="combobox"]')).toMatch(/^Heebo/);
    expect(await main(page).locator('[data-anl-feature_name="Featured Topic"] h3 + div > span').first().evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Taamey Frank/);
    expect(await main(page).locator('[data-anl-batch*="newsletter_topics"] button').evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^Roboto/);
    expect(await main(page).getByRole("link", { name: "לרשימת כל הפרשות" }).evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^Cardo/);
    expect(Math.round((await main(page).getByRole("link", { name: "לרשימת כל הפרשות" }).locator("..").boundingBox())!.height)).toBe(21);
  });
});

// @feature TOP-003 @feature TOP-004 @feature TOP-006 @feature I18-013
test.describe("the landing page in the Hebrew interface on a phone", () => {
  test.use(PHONE);
  test("the search in the English sans, 'browse all' and the featured description in the Hebrew serif (as sefaria.org.il)", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, "/topics");
    expect(await fontOf(page, 'main [role="combobox"]')).toMatch(/^Roboto/);
    const explore = main(page).getByRole("button", { name: "לדפדוף בכל הנושאים ›" });
    expect(await explore.locator("span").first().evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Taamey Frank/);
    expect(Math.round((await explore.boundingBox())!.height)).toBe(21);
    const featured = main(page).locator('[data-anl-feature_name="Featured Topic"]');
    // its title row is the title's own line (32px), not the h3's taller serif strut
    expect(Math.round((await featured.getByRole("heading", { level: 3 }).boundingBox())!.height)).toBe(32);
    expect(await featured.locator("h3 + div > span").first().evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Taamey Frank/);
  });
});
