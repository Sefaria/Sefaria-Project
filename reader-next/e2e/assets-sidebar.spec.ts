import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * Interactive pages in the sidebar (CON-075): the reader asks Sefaria Social which published pages cover the passage, lists them under
 * Resources, and opens one beside the text, linked. Runs on the e2e server with the social lab on (E2E_SOCIAL_URL): its Social API is
 * configured on E2E_SURFACE_ORIGIN, where nothing listens, so these tests answer Social's routes with page.route (Social spec 062's
 * shapes). The surface itself is not served: the reader keeps working without it.
 */
const SOCIAL_URL = process.env.E2E_SOCIAL_URL!;
const SOCIAL = process.env.E2E_SURFACE_ORIGIN!;
const CORS = { "access-control-allow-origin": "*" };
const ID = "6f1c2d3e-0000-4000-8000-000000000001";
const SAMPLE = readFileSync("public/assets/samples/seven-days.html", "utf8");
const DAY_ONE = ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3", "Genesis 1:4", "Genesis 1:5"];

async function serveSocial(page: Page, assets: unknown[]) {
  await page.route(`${SOCIAL}/social-surface/**`, (r) => r.fulfill({ status: 404, headers: CORS, body: "" }));
  await page.route(`${SOCIAL}/api/v1/claude-assets/ref/**`, (r) => r.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({ ref: "Genesis 1", assets }) }));
  await page.route(`${SOCIAL}/api/v1/claude-assets/${ID}`, (r) =>
    r.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({ id: ID, title: "The Seven Days", currentVersionId: "v1", versions: [{ id: "v1", n: 1, contentUrl: `${SOCIAL}/api/v1/claude-assets/content/v1` }] }) }),
  );
  await page.route(`${SOCIAL}/api/v1/claude-assets/content/v1`, (r) =>
    r.fulfill({ contentType: "text/html", headers: { "content-security-policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:" }, body: SAMPLE }),
  );
}
const published = { id: ID, title: "The Seven Days", description: "A scrolling story of creation.", author: { name: "A. Teacher", profileId: "p1", verified: true }, anchorRefs: DAY_ONE, refs: ["Genesis 1:1-5"], versionId: "v1", contentUrl: `${SOCIAL}/api/v1/claude-assets/content/v1` };

test.describe("interactive pages in the sidebar", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  // @feature CON-075 Interactive pages on a passage
  test("a published page on the verse is listed under Resources and opens beside the text, linked", async ({ page }) => {
    await serveSocial(page, [published]);
    await open(page, `${SOCIAL_URL}/Genesis.1.3?lang=bi&with=all&lang2=en`);
    const row = page.getByRole("link", { name: /Interactive Pages/ });
    // the sidebar's counts come from /api/related, which a cold server can take a while to answer
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await expect(page.getByRole("heading", { name: "The Seven Days" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Verified author" })).toBeVisible();
    await page.getByRole("button", { name: "Open beside the text" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("a2")).toBe(`${ID}@v1`);
    expect(new URL(page.url()).searchParams.get("link")).toBe("2-1");
    await expect(page.frameLocator('section[data-panel-kind="asset"] iframe').locator(".status")).toHaveText(/Day one/);
  });

  // @feature CON-075 Interactive pages on a passage
  test("no page on the selection: no row; Social down: no row and the sidebar works", async ({ page }) => {
    await serveSocial(page, [{ ...published, anchorRefs: ["Genesis 1:20"] }]);
    await open(page, `${SOCIAL_URL}/Genesis.1.3?lang=bi&with=all&lang2=en`);
    await expect(page.getByRole("link", { name: /Web Pages|Translations/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Interactive Pages/ })).toHaveCount(0);
    await page.unroute(`${SOCIAL}/api/v1/claude-assets/ref/**`);
    await page.route(`${SOCIAL}/api/v1/claude-assets/ref/**`, (r) => r.abort());
    await open(page, `${SOCIAL_URL}/Genesis.1.4?lang=bi&with=all&lang2=en`);
    await expect(page.getByRole("link", { name: /Translations/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Interactive Pages/ })).toHaveCount(0);
  });
});
