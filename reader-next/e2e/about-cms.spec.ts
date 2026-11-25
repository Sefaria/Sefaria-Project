import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { devices, expect, test, type Page } from "@playwright/test";
import { TEAM_QUERY, UNDATED_RANGE } from "../src/lib/cms/cms";
import { open } from "./helpers";
import { seedStaticPages } from "./static-pages-cassette";

/**
 * The About pages filled from the CMS (Strapi): /team, /products and /jobs. Django's content block (the About sidebar, the headings,
 * the contact lines) comes from e2e/fixtures/static-pages, written into the cassette (static-pages-cassette.ts); the CMS part is
 * asked for in the browser through Django's proxy, POST /api/strapi/graphql-cache. The team's and the products' answers are recorded
 * in the cassette from www.sefaria.org; the jobs query names the current hour, so its answers are given here. "The CMS cannot be
 * reached" is the proxy failing (a 500, or GraphQL errors in a 200 as a CMS that forbids the query answers).
 *
 * What the team page must show is read from the recorded answer itself (no names in this file): its counts, and the old page's
 * ordering rules checked on the page (staff by last name, the board's chairman and co-founders first, then by last name).
 */
test.beforeAll(() => {
  seedStaticPages();
});

const CMS = "**/api/strapi/graphql-cache?**";
const content = (page: Page) => page.locator("#staticContentWrapper #content");
const hebrew = (page: Page) => page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
/** The images are the CMS's media host's (placeholders on example.org in the scrubbed recording): not needed here. */
const noMedia = (page: Page) => page.route(/media\.strapiapp\.com|example\.org\//, (r) => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' }));
const cmsFails = (page: Page, how: "http" | "graphql") =>
  page.route(CMS, (r) =>
    how === "http"
      ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Strapi request failed with status 403" }) })
      : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null, errors: [{ message: "Forbidden access" }] }) }),
  );

type RecordedMember = { teamName: string; teamTitle: string; isTeamBoardMember: boolean; localizations: { teamName: string }[] };
/** The team answer the cassette replays (scripts/api-cassette.mjs: sha1 of "POST <url>\n<body>", gzip of a header line and the body). */
function recordedTeam(): RecordedMember[] {
  const dir = process.env.E2E_CASSETTE_DIR || new URL("./.cassette/", import.meta.url).pathname;
  const url = `/api/strapi/graphql-cache?start_date=${UNDATED_RANGE.start}&end_date=${UNDATED_RANGE.end}`;
  const raw = gunzipSync(readFileSync(join(dir, `${createHash("sha1").update(`POST ${url}\n${TEAM_QUERY}`).digest("hex")}.gz`)));
  return JSON.parse(raw.subarray(raw.indexOf(10) + 1).toString()).data.teamMembers;
}
const lastName = (name: string) => name.trim().split(/\s+/).pop()!;
const byLastName = (locale: string) => (names: string[]) => [...names].sort((a, b) => lastName(a).localeCompare(lastName(b), locale));

// @feature STA-010
test.describe("/team", () => {
  test("the staff and the board from the CMS, inside Django's page: sidebar, heading, contact lines", async ({ page }) => {
    await noMedia(page);
    await open(page, "/team");
    await expect(page).toHaveTitle("The Sefaria Team");
    await expect(content(page).locator("#aboutSidebar a.selected")).toHaveText("Team", { useInnerText: true });
    await expect(content(page).getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    const recorded = recordedTeam();
    const staffCount = recorded.filter((m) => !m.isTeamBoardMember).length;
    const boardCount = recorded.length - staffCount;
    expect(staffCount).toBeGreaterThan(10);
    const members = content(page).locator("#teamMembersPageContent .teamMember");
    await expect(members).toHaveCount(staffCount);
    const staff = await content(page).locator(".team-members .teamName").allInnerTexts();
    expect(staff).toEqual(byLastName("en")(staff));
    expect(new Set(staff)).toEqual(new Set(recorded.filter((m) => !m.isTeamBoardMember).map((m) => m.teamName.trim())));
    const first = members.first();
    await expect(first.locator("img")).toHaveAttribute("src", /^https:\/\/.+\.jpg$/);
    await expect(first.locator("img")).toHaveAttribute("alt", `Headshot of ${staff[0]}`);
    await expect(content(page).getByRole("heading", { level: 2, name: "BOARD OF DIRECTORS" })).toBeVisible();
    await expect(content(page).locator(".board-members .teamBoardMember")).toHaveCount(boardCount);
    // the chairman, the co-founders, then the others by last name
    const titles = await content(page).locator(".board-members .teamTitle").allInnerTexts();
    expect(titles.slice(0, 3)).toEqual(["Chairman", "Co-Founder", "Co-Founder"]);
    const rest = (await content(page).locator(".board-members .teamName").allInnerTexts()).slice(3);
    expect(rest).toEqual(byLastName("en")(rest));
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
    const recorded = recordedTeam();
    const he = (m: RecordedMember) => m.localizations[0]!.teamName.trim();
    await expect(content(page).locator(".team-members .teamMember")).toHaveCount(recorded.filter((m) => !m.isTeamBoardMember).length);
    const staff = await content(page).locator(".team-members .teamName").allInnerTexts();
    expect(staff).toEqual(byLastName("he")(recorded.filter((m) => !m.isTeamBoardMember).map(he)));
    const chairman = recorded.find((m) => m.isTeamBoardMember && m.teamTitle.trim().toLowerCase() === "chairman")!;
    await expect(content(page).locator(".board-members .teamName").first()).toHaveText(he(chairman));
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
    await expect(content(page).locator(".teamMember")).toHaveCount(recordedTeam().filter((m) => !m.isTeamBoardMember).length);
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
    await expect(members).toHaveCount(recordedTeam().filter((m) => !m.isTeamBoardMember).length);
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
    // the description's links open in the same tab, as on the old page (the old InterfaceText markdown: rel only)
    const descLinks = content(page).locator(".productDescWrapper a[href]");
    expect(await descLinks.count()).toBeGreaterThan(0);
    expect(await descLinks.evaluateAll((as) => as.map((a) => [a.getAttribute("target"), a.getAttribute("rel")]))).toEqual(
      Array(await descLinks.count()).fill([null, "noopener noreferrer"]),
    );
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
