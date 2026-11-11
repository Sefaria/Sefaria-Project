import { devices, expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";
import { seedStaticPages } from "./static-pages-cassette";

/**
 * The About pages filled from the CMS (Strapi): /team, /products and /jobs. Django's content block (the About sidebar, the headings,
 * the contact lines) comes from e2e/fixtures/static-pages, written into the cassette (static-pages-cassette.ts); the CMS part is
 * asked for in the browser through Django's proxy, POST /api/strapi/graphql-cache. The team's and the products' answers are recorded
 * in the cassette from www.sefaria.org; the jobs query names the current hour, so its answers are given here. "The CMS cannot be
 * reached" is the proxy failing (a 500, or GraphQL errors in a 200 as a CMS that forbids the query answers).
 */
test.beforeAll(() => {
  seedStaticPages();
});

const CMS = "**/api/strapi/graphql-cache?**";
const content = (page: Page) => page.locator("#staticContentWrapper #content");
const hebrew = (page: Page) => page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
/** The images are the CMS's media host's: not needed here. */
const noMedia = (page: Page) => page.route(/media\.strapiapp\.com/, (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
const cmsFails = (page: Page, how: "http" | "graphql") =>
  page.route(CMS, (r) =>
    how === "http"
      ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Strapi request failed with status 403" }) })
      : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null, errors: [{ message: "Forbidden access" }] }) }),
  );

// @feature STA-010
test.describe("/team", () => {
  test("the staff and the board from the CMS, inside Django's page: sidebar, heading, contact lines", async ({ page }) => {
    await noMedia(page);
    await open(page, "/team");
    await expect(page).toHaveTitle("The Sefaria Team");
    await expect(content(page).locator("#aboutSidebar a.selected")).toHaveText("Team", { useInnerText: true });
    await expect(content(page).getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    const members = content(page).locator("#teamMembersPageContent .teamMember");
    await expect(members).toHaveCount(38); // the recorded answer: 51 people, 13 of them on the board
    await expect(members.first().locator(".teamName")).toHaveText("Akiva Berger");
    await expect(members.first().locator("img")).toHaveAttribute("src", /media\.strapiapp\.com\/.+\.jpg$/);
    await expect(members.first().locator("img")).toHaveAttribute("alt", "Headshot of Akiva Berger");
    await expect(content(page).getByRole("heading", { level: 2, name: "BOARD OF DIRECTORS" })).toBeVisible();
    const board = content(page).locator(".board-members .teamBoardMember .teamName");
    await expect(board).toHaveCount(13);
    // the chairman, the co-founders, then the others by last name
    await expect(board.nth(0)).toHaveText("Samuel Moed");
    await expect(board.nth(1)).toHaveText("Joshua Foer");
    await expect(board.nth(2)).toHaveText("Brett Lockspeiser");
    await expect(board.nth(3)).toHaveText("Raanan Agus");
    await expect(content(page).locator("#teamContact a").first()).toHaveAttribute("href", "mailto:hello@sefaria.org");
    // laid out by the old site's rules: 202px pictures, three to a row in the 660px column
    const boxes = await members.evaluateAll((els) => els.slice(0, 4).map((e) => e.getBoundingClientRect()).map((r) => [Math.round(r.x), Math.round(r.width)]));
    expect(boxes[0]![1]).toBe(202);
    expect(boxes[3]![0]).toBe(boxes[0]![0]);
  });

  test("Hebrew: the Hebrew names, ordered by the Hebrew last name, and the board's Hebrew heading", async ({ page }) => {
    await noMedia(page);
    await hebrew(page);
    await open(page, "/team");
    await expect(content(page).getByRole("heading", { level: 2, name: "מועצת המנהלים" })).toBeVisible();
    await expect(content(page).locator(".team-members .teamMember")).toHaveCount(38);
    await expect(content(page).locator(".team-members .teamName").first()).toHaveText("אלי אוהיסו");
    await expect(content(page).locator(".board-members .teamName").first()).toHaveText("שמואל מועד");
  });

  test("the CMS cannot be reached: the old page's error instead of the team, the rest of the page as it is", async ({ page }) => {
    await cmsFails(page, "graphql");
    await open(page, "/team");
    await expect(content(page).getByRole("heading", { level: 1, name: "Error: Sefaria's CMS cannot be reached" })).toBeVisible();
    await expect(content(page).locator(".teamMember")).toHaveCount(0);
    await expect(content(page).locator("#teamContact")).toBeVisible();
  });

  test("while the CMS answers, the page says Loading...", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(CMS, async (r) => {
      await held;
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { teamMembers: [] } }) });
    });
    await open(page, "/team");
    await expect(content(page).locator("#teamMembersPageContent .loadingMessage")).toHaveText("Loading...");
    release();
    await expect(content(page).getByRole("heading", { level: 2, name: "BOARD OF DIRECTORS" })).toBeVisible();
    await expect(content(page).locator(".loadingMessage")).toHaveCount(0);
  });

  test("reached from the About sidebar inside the app, without a reload", async ({ page }) => {
    await noMedia(page);
    await open(page, "/about");
    await page.evaluate(() => ((window as unknown as { __stay: number }).__stay = 1));
    await content(page).locator("#aboutSidebar").getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(content(page).locator(".teamMember")).toHaveCount(38);
    expect(await page.evaluate(() => (window as unknown as { __stay?: number }).__stay)).toBe(1);
  });
});

// @feature STA-010
test.describe("/team on a phone @mobile", () => {
  test.use({ viewport: { width: 412, height: 839 }, userAgent: devices["Pixel 7"].userAgent, isMobile: true, hasTouch: true });
  test("one column of members, centred", async ({ page }) => {
    await noMedia(page);
    await open(page, "/team");
    const members = content(page).locator(".team-members .teamMember");
    await expect(members).toHaveCount(38);
    const [a, b] = await members.evaluateAll((els) => els.slice(0, 2).map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(a).toBe(b);
    expect(a).toBe(105); // as www.sefaria.org at 412px: a 202px column in the middle
  });
});

// @feature STA-011
test.describe("/products", () => {
  test("the products in rank order, with the Powered by Sefaria box after the second", async ({ page }) => {
    await noMedia(page);
    await open(page, "/products");
    await expect(page).toHaveTitle("Products");
    await expect(content(page).getByRole("heading", { level: 1, name: "Sefaria's Products" })).toBeVisible();
    await expect(content(page).locator(".productsTitle")).toHaveText(["Learning Guide: Pirkei Avot", "Sefaria for Google Docs", "Mobile Apps", "Torah Tab", "Text API", "Linker"]);
    await expect(content(page).locator(".productsFlexWrapper > *").nth(2)).toHaveClass("productsDevBox");
    await expect(content(page).locator(".productsDevBox a")).toHaveAttribute("href", "https://powered-by.sefaria.org");
    const first = content(page).locator(".product").first();
    await expect(first.locator(".productsTypeLabel")).toHaveText("Experiment");
    await expect(first.locator(".cta a")).toHaveAttribute("href", "https://www.sefaria.org/Pirkei_Avot.1.1?lang=bi&with=Guide&lang2=en");
    await expect(first.locator(".productDescWrapper strong")).toContainText("Pirkei Avot");
    await expect(content(page).locator(".product").nth(2).locator(".productsCTAIcon")).toHaveCount(2); // the store icons
  });

  test("Hebrew: the Hebrew titles and description", async ({ page }) => {
    await noMedia(page);
    await hebrew(page);
    await open(page, "/products");
    await expect(content(page).getByRole("heading", { level: 1, name: "המוצרים של ספריא" })).toBeVisible();
    await expect(content(page).locator(".productsTitle").first()).toHaveText("מדריך למידה: פרקי אבות");
    await expect(content(page).locator(".productsDevHeader")).toHaveText("פרויקטים מכח ספריא");
  });

  test("the CMS cannot be reached: the page's heading and the error (the old page showed only the heading)", async ({ page }) => {
    await cmsFails(page, "http");
    await open(page, "/products");
    await expect(content(page).getByRole("heading", { level: 1, name: "Sefaria's Products" })).toBeVisible();
    await expect(content(page).getByRole("heading", { level: 1, name: "Error: Sefaria's CMS cannot be reached" })).toBeVisible();
    await expect(content(page).locator(".product")).toHaveCount(0);
  });
});

// @feature STA-009
test.describe("/jobs", () => {
  test("open positions by department; none: the notice; the solicitation notice either way", async ({ page }) => {
    let postings: unknown[] = [
      { documentId: "a", jobLink: "https://example.org/a", jobDescription: "Senior Software Engineer", jobDepartmentCategory: "Engineering" },
      { documentId: "b", jobLink: "https://example.org/b", jobDescription: "Operations Manager", jobDepartmentCategory: "HR_and_Operations" },
    ];
    const asked: string[] = [];
    await page.route(CMS, (r) => {
      asked.push(r.request().postData() ?? "");
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { jobPostings: postings } }) });
    });
    await open(page, "/jobs");
    await expect(content(page).getByRole("heading", { level: 2, name: "HR and Operations" })).toBeVisible();
    await expect(content(page).getByRole("link", { name: "Senior Software Engineer" })).toHaveAttribute("href", "https://example.org/a");
    await expect(content(page).getByRole("heading", { level: 2, name: "About Sefaria" })).toBeVisible();
    expect(asked[0]).toMatch(/jobPostingStartDate: \{ lte: "\d{4}-\d\d-\d\dT\d\d:00:00\.000Z" \}/);
    await expect(content(page).locator(".solicitationNotice")).toBeVisible();

    postings = [];
    await open(page, "/jobs");
    await expect(content(page).getByText("Sefaria does not currently have any open positions.")).toBeVisible();
    await expect(content(page).getByRole("heading", { level: 1, name: "Jobs at Sefaria" })).toBeVisible();
  });

  test("the CMS cannot be reached: the old page's error", async ({ page }) => {
    await cmsFails(page, "http");
    await open(page, "/jobs");
    await expect(content(page).getByRole("heading", { level: 1, name: "Error: Sefaria's CMS cannot be reached" })).toBeVisible();
  });
});
