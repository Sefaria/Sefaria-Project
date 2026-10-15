import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// @feature RTE-029 @feature SRC-039 @feature SRC-040 @feature SRC-046 @feature SRC-048 @feature SRC-052 @feature SRC-054 @feature SRC-085 @feature SRC-016 @feature SRC-041 @feature SRC-043 @feature SRC-047 @feature SRC-056 @feature SRC-067 @feature SRC-070 @feature SRC-071 @feature SRC-072 @feature SRC-086
test.describe("search results page", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("shows tabs with counts, results with folded versions, and the filter tree", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    await expect(page.getByRole("link", { name: /^Sources/ })).toBeVisible();
    await expect(page.getByText("Genesis 1:3").first()).toBeVisible();
    await expect(page.getByText(/more versions?/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Tanakh", exact: true })).toBeVisible();
  });

  test("Exact Phrase and a filter are kept in the address", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    await page.getByRole("button", { name: "Exact Phrase" }).click();
    await expect(page).toHaveURL(/tvar=0/);
    await page.getByRole("checkbox", { name: "Tanakh", exact: true }).click();
    await expect(page).toHaveURL(/tpathFilters=Tanakh/);
    await page.goBack();
    await expect(page).not.toHaveURL(/tpathFilters/);
  });

  test("a result opens in the reader", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    await page.getByText("Genesis 1:3").first().click();
    await expect(page).toHaveURL(/\/Genesis\.1\.3/);
  });
});

// @feature SRC-058 @feature TXT-027 @feature TXD-029
test.describe("matched words in the reader", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("opening a result highlights the searched words in its verse, until the reader moves on", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    await page.getByText("Genesis 1:3").first().click();
    await expect(page).toHaveURL(/\/Genesis\.1\.3/);
    const marks = page.locator('[role="group"][data-ref="Genesis 1:3"] .queryTextHighlight');
    await expect(marks.first()).toBeVisible();
    expect(new URL(page.url()).search).not.toContain("light");
    await page.reload();
    await page.waitForSelector("html[data-hydrated='true']");
    await expect(page.locator(".queryTextHighlight")).toHaveCount(0);
  });

  test("scrolling on to another verse clears them", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    await page.getByText("Genesis 1:3").first().click();
    await expect(page.locator(".queryTextHighlight").first()).toBeVisible();
    await page.locator("[data-reader-scroller]").hover();
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(150); }
    await expect(page.locator(".queryTextHighlight")).toHaveCount(0);
  });
});

// @feature SRC-066 @feature SRC-068 @feature SRC-069 @feature SRC-070 @feature SRC-071 @feature SRC-072
test.describe("Books, Authors and Topics tabs", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a book card: crumbs, name, date · author, description; the sort and the category filter act on the server's results", async ({ page }) => {
    await open(page, "/search?q=rashi&tab=text&search_tab=books");
    const first = page.locator("ul li").filter({ hasText: "Siddur Rashi" }).first();
    await expect(first.getByRole("link", { name: "Halakhah" })).toBeVisible();
    await expect(first.getByRole("link", { name: "Siddur Rashi" })).toHaveAttribute("href", "/Siddur_Rashi");
    await expect(first).toContainText("CE");
    await page.getByRole("button", { name: /Sort by Relevance/ }).click();
    await expect(page.getByRole("menuitemradio")).toHaveText([/Relevance/, /Composition Date \(Oldest First\)/, /Composition Date \(Newest First\)/, /A-Z/]);
    await page.getByRole("menuitemradio", { name: "A-Z" }).click();
    await expect(page.getByRole("button", { name: /Sort by A-Z/ })).toBeVisible();
    expect(new URL(page.url()).search).not.toContain("alpha");
    // filter: only Halakhah books remain
    await page.getByRole("checkbox", { name: "Halakhah" }).click();
    await expect(page.locator("ul li").filter({ hasText: "Rashi on Tanakh" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Siddur Rashi" })).toBeVisible();
  });

  test("authors and topics: a lifespan; topics sort only by relevance or A-Z, and have no filters", async ({ page }) => {
    await open(page, "/search?q=light&tab=text&search_tab=authors");
    await expect(page.getByText(/1520 – 1609 CE/)).toBeVisible();
    await open(page, "/search?q=light&tab=text&search_tab=topics");
    await page.getByRole("button", { name: /Sort by Relevance/ }).click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Filters" })).toHaveCount(0);
  });
});

// @feature SRC-049 @feature SRC-062 @feature SRC-063
test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("tabs are a strip; sorting and filtering are one button opening a full-screen panel", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Sources/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Filters" })).toHaveCount(0); // no sidebar
    await expect(page.getByRole("button", { name: "Exact Phrase" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sort & filter results" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("heading", { name: "Search Type" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Sort by" })).toBeVisible();
    await expect(panel.getByRole("radio", { name: "Chronological" })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: "Tanakh", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Exact Phrase" }).click();
    await expect(page).toHaveURL(/tvar=0/);
    await panel.getByRole("button", { name: "Show Results" }).click();
    await expect(panel).toHaveCount(0);
  });

  test("Books: Filter panel with sort radios; Authors and Topics: Sort only; changing tab closes the panel", async ({ page }) => {
    await open(page, "/search?q=rashi&tab=text&search_tab=books");
    await page.getByRole("button", { name: "Sort & filter results" }).click();
    await expect(page.getByRole("dialog", { name: "Filter" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "A-Z" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Halakhah" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("tab", { name: /^Topics/ }).click();
    await page.getByRole("button", { name: "Sort & filter results" }).click();
    await expect(page.getByRole("dialog", { name: "Sort" })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });
});

// @feature SRC-064
test.describe("nothing found", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const [tab, heading, cta, href] of [["sources", "No sources found for “zzzxqkw”", "Browse Library", "/texts"], ["books", "No books found for “zzzxqkw”", "Browse Library", "/texts"], ["authors", "No authors found for “zzzxqkw”", "Browse Authors", "https://www.sefaria.org/people"], ["topics", "No topics found for “zzzxqkw”", "Browse Topics", "https://www.sefaria.org/topics"]] as const) {
    test(`${tab}: heading, a way on, and where to report a problem`, async ({ page }) => {
      await open(page, `/search?q=zzzxqkw&tab=text&search_tab=${tab}`);
      await expect(page.getByText(heading)).toBeVisible();
      await expect(page.getByRole("link", { name: cta })).toHaveAttribute("href", href);
      await expect(page.getByRole("link", { name: "Report a bug" })).toBeVisible();
      await expect(page.getByRole("link", { name: "contact us" })).toHaveAttribute("href", "mailto:hello@sefaria.org");
    });
  }
});

// @feature SRC-050 @feature SRC-065
test.describe("a search that fails", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("says so and offers Try again — not 'No sources found'", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    await page.route("**/api/search-wrapper/**", (r) => r.abort());
    await page.getByRole("textbox", { name: "Search" }).fill("darkness");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toContainText("Something went wrong with the search.");
    await expect(page.getByText("No sources found")).toHaveCount(0);
    await page.unroute("**/api/search-wrapper/**");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText(/more versions?/).first()).toBeVisible({ timeout: 20_000 });
  });
});

// @feature SRC-082
test.describe("Hebrew search merges Dicta's Tanakh (as on sefaria.org)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("All Results asks Dicta and shows its verses; Exact Phrase does not", async ({ page }) => {
    const dicta: string[] = [];
    page.on("request", (r) => r.url().includes("dicta.org.il") && dicta.push(new URL(r.url()).pathname));
    await page.goto("/");
    await page.waitForSelector("html[data-hydrated='true']");
    await page.getByRole("combobox").first().fill("אור");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByText("Tanach with Ta'amei Hamikra").first()).toBeVisible({ timeout: 20_000 });
    expect(dicta).toEqual(expect.arrayContaining(["/search", "/books"]));
    await expect(page.getByRole("link", { name: /^Sources/ })).toContainText(/\d{2},\d{3}\+/);
    dicta.length = 0;
    await page.getByRole("button", { name: "Exact Phrase" }).click();
    await expect(page).toHaveURL(/tvar=0/);
    await page.waitForTimeout(1500);
    expect(dicta.filter((p) => p === "/search")).toEqual([]);
  });
});
