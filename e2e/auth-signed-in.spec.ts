import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Signing in for real, against a DEPLOYMENT of this client served same-origin with Django (a cauldron), with the test account of
 * Sefaria-Project's e2e suite. Skipped unless READER_E2E_BASE_URL is set AND the account is found in Sefaria-Project's
 * e2e-tests/.env (PLAYWRIGHT_USER_EMAIL / PLAYWRIGHT_USER_PASSWORD; or SEFARIA_E2E_ENV pointing at such a file). The values are
 * read at run time only — never logged, never written anywhere.
 *
 * Never point this at production with a personal account.
 */
function readEnvFile(): Record<string, string> {
  const candidates = [process.env.SEFARIA_E2E_ENV, resolve(process.cwd(), "../Sefaria-Project/e2e-tests/.env"), resolve(process.cwd(), "../e2e-tests/.env")].filter(Boolean) as string[];
  const file = candidates.find((f) => existsSync(f));
  if (!file) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnvFile();
const BASE = process.env.READER_E2E_BASE_URL;
const EMAIL = process.env.PLAYWRIGHT_USER_EMAIL || env.PLAYWRIGHT_USER_EMAIL;
const PASSWORD = process.env.PLAYWRIGHT_USER_PASSWORD || env.PLAYWRIGHT_USER_PASSWORD;

// @feature ACC-009 @feature GUI-010 @feature ACC-007
test.describe("signed in on a real deployment", () => {
  test.skip(!BASE || !EMAIL || !PASSWORD, "needs READER_E2E_BASE_URL and the e2e test account");
  test.use({ baseURL: BASE });

  test("log in with email, the header knows who is signed in (first paint too), log out", async ({ page }) => {
    await page.goto("/login?next=%2FGenesis.1");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.getByLabel("Email Address").fill(EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD!);
    await page.getByRole("button", { name: /^Log in$/ }).click();
    await expect(page).toHaveURL(/\/Genesis\.1/);
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Sign Up" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Saved items" })).toBeVisible();

    // the server render already says signed in (the viewer query forwards the cookie)
    const html = await (await page.request.get("/Genesis.1")).text();
    expect(html).not.toContain(">Sign Up<");

    // /login while signed in goes home, as Django's view did
    await page.goto("/login");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/Genesis.1");
    await header.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("dialog", { name: "Account menu" });
    await expect(menu.getByRole("link", { name: "Account Settings" })).toBeVisible();
    await menu.getByRole("link", { name: "Log Out" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign Up" })).toBeVisible();
  });

  // @feature USL-010 @feature USL-011 @feature USL-001
  test("Save toggles the bookmark on the server, and reading is recorded in the reader's history", async ({ page }) => {
    await page.goto("/login?next=%2FExodus.3");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.getByLabel("Email Address").fill(EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD!);
    await page.getByRole("button", { name: /^Log in$/ }).click();
    await expect(page).toHaveURL(/\/Exodus\.3/);
    // history: the text was recorded on arrival (signed in: POST /api/profile/sync)
    await expect.poll(async () => {
      const r = await page.request.get("/api/profile/user_history?saved=0&secondary=0&annotate=0&limit=5");
      return ((await r.json()) as { ref: string }[]).map((x) => x.ref);
    }).toContain("Exodus 3");
    // Save: whatever the state, toggle twice and check the server each time
    const save = page.locator("main header").first().getByRole("button", { name: /^(Save|Remove) "Exodus 3"$/ });
    const savedOnServer = async () => {
      const r = await page.request.get("/api/profile/user_history?saved=1&secondary=0&annotate=0&limit=1000");
      return ((await r.json()) as { ref: string }[]).some((x) => x.ref === "Exodus 3");
    };
    const before = await savedOnServer();
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", String(!before));
    await expect.poll(savedOnServer).toBe(!before);
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", String(before));
    await expect.poll(savedOnServer).toBe(before);
  });
});

