import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { open } from "./helpers";

/**
 * The Library Assistant's findings in the sidebar (the `findings` lab). The lab is on only on the e2e server E2E_SOCIAL_URL
 * (playwright.config.ts), whose assistant API (CHATBOT_API_BASE_URL) is on E2E_SURFACE_ORIGIN, where nothing listens: these tests
 * answer the findings API there with page.route (made-up findings, src/ui/FindingsView/story-data.ts), or fail it. The chat service
 * is never reached, and the main server (lab off) is checked to make no request at all.
 */
const LAB_URL = process.env.E2E_SOCIAL_URL!;
const ASSISTANT_API = `${process.env.E2E_SURFACE_ORIGIN}/assistant-api`;
const FINDINGS = `${ASSISTANT_API}/findings/ref/**`;
const CORS = { "access-control-allow-origin": "*" };
/** Made-up findings on Genesis 1, the ones the FindingsView stories show. */
const GENESIS_1_ANSWER = JSON.parse(readFileSync(new URL("../src/ui/FindingsView/genesis-1-findings.json", import.meta.url), "utf8")) as { findings: { url: string }[] };

const side = (page: Page) => page.getByRole("complementary");
const serveFindings = (page: Page, answer: (route: Route) => Promise<void> = (r) => r.fulfill({ json: GENESIS_1_ANSWER, headers: CORS })) =>
  page.route(FINDINGS, answer);

// @feature CON-073 @feature CON-074 @feature CON-014
test.describe("findings (lab on)", () => {
  test.use({ baseURL: LAB_URL });

  test("Resources counts the verse's findings; the row opens them grouped by method; back returns to Resources", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (r) => r.url().includes("/findings/ref/") && asked.push(r.url()));
    await serveFindings(page);
    await open(page, "/Genesis.1.1?lang=en&with=all");
    // the section's findings (one address; the dev build's strict mode may cancel and repeat the first request); two of its three
    // findings are anchored to 1:1
    const row = side(page).getByRole("link", { name: /^Findings/ });
    await expect(row).toHaveText(/Findings\s*\(2\)/, { timeout: 30_000 });
    expect([...new Set(asked)]).toEqual([`${ASSISTANT_API}/findings/ref/Genesis%201`]);

    await row.click();
    await expect(page).toHaveURL(/with=Findings/);
    // one finding each on this verse: by title
    await expect(side(page).getByRole("heading", { level: 3 })).toHaveText(["Rabbi Almoni's Questions", "Rabbi Ploni's Method"]);
    const finding = side(page).getByRole("listitem").filter({ hasText: "The first verse as a heading for the chapter" });
    await expect(finding).toContainText("AI-assisted reading in the approach of Rabbi Ploni");
    await expect(finding.getByRole("link", { name: "Psalms 104:2" })).toHaveAttribute("href", /\/Psalms\.104\.2/);
    await expect(finding.getByRole("link", { name: "Open sheet" })).toHaveAttribute("target", "_blank");
    await expect(finding.getByRole("link", { name: "View finding" })).toHaveAttribute("href", GENESIS_1_ANSWER.findings[0]!.url);
    // the finding on 1:3 is not on this verse
    await expect(side(page).getByText("Light before the luminaries")).toHaveCount(0);
    await finding.getByRole("button", { name: "Show more" }).click();
    await expect(finding.getByRole("button", { name: "Show less" })).toBeVisible();

    await side(page).getByRole("link", { name: "Resources" }).click();
    await expect(page).toHaveURL(/with=all/);
    await expect(row).toBeVisible();
  });

  test("a link straight to the findings view", async ({ page }) => {
    await serveFindings(page);
    await open(page, "/Genesis.1.1?lang=en&with=Findings");
    await expect(side(page).getByRole("heading", { name: "Rabbi Ploni's Method" })).toBeVisible({ timeout: 30_000 });
  });

  test("the chat service failing or down: no row, the rest of Resources as usual, and the view says none are known", async ({ page }) => {
    await serveFindings(page, (r) => r.fulfill({ status: 503, body: "", headers: CORS }));
    await open(page, "/Genesis.1.1?lang=en&with=all");
    await expect(side(page).getByRole("link", { name: /^Sheets/ })).toHaveText(/\(\d+\)/, { timeout: 30_000 });
    await expect(side(page).getByRole("link", { name: /^Findings/ })).toHaveCount(0);

    await page.unroute(FINDINGS);
    await serveFindings(page, (r) => r.abort("connectionrefused"));
    await open(page, "/Genesis.1.1?lang=en&with=Findings");
    await expect(side(page).getByText("No findings known here.")).toBeVisible({ timeout: 30_000 });
  });

  test("Hebrew interface: Hebrew method names and links", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await serveFindings(page);
    await open(page, "/Genesis.1.1?lang=en&with=Findings");
    await expect(side(page).getByRole("heading", { level: 3 })).toHaveText(["שאלות רבי אלמוני", "שיטת רבי פלוני"], { timeout: 30_000 });
    await expect(side(page).getByRole("link", { name: "פתיחת דף המקורות" })).toHaveCount(1);
  });
});

// @feature CON-073
test.describe("findings (lab off)", () => {
  test("no request, no row, and with=Findings shows Resources", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (r) => r.url().includes("/findings/ref/") && asked.push(r.url()));
    await open(page, "/Genesis.1.1?lang=en&with=Findings");
    await expect(side(page).getByRole("heading", { name: "Related Texts" })).toBeVisible({ timeout: 30_000 });
    await expect(side(page).getByRole("link", { name: /^Sheets/ })).toHaveText(/\(\d+\)/, { timeout: 30_000 });
    await expect(side(page).getByRole("link", { name: /^Findings/ })).toHaveCount(0);
    expect(asked).toEqual([]);
  });
});
