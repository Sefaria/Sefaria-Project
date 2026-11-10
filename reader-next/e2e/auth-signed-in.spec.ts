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

  // @feature CON-049 @feature USL-007
  test("Notes: add a note on a verse, see it, delete it (cleans up after itself)", async ({ page }) => {
    await page.goto("/login?next=%2FExodus.3.2%3Fwith%3DNotes");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.getByLabel("Email Address").fill(EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD!);
    await page.getByRole("button", { name: /^Log in$/ }).click();
    await expect(page).toHaveURL(/with=Notes/);
    const side = page.getByRole("complementary");
    const text = `e2e note ${Date.now()}`;
    await side.getByRole("textbox", { name: "Write a note..." }).fill(text);
    await side.getByRole("button", { name: "Add Note" }).click();
    const note = side.getByRole("list", { name: "My notes" }).getByText(text);
    await expect(note).toBeVisible();
    await note.hover();
    await side.getByRole("listitem").filter({ hasText: text }).getByRole("button", { name: "Edit Note" }).click();
    page.once("dialog", (d) => void d.accept());
    await side.getByRole("button", { name: "Delete Note" }).click();
    await expect(side.getByText(text)).toHaveCount(0);
  });
});


/**
 * T-E05: signed-in state across the two clients, on an `optin` deployment (nginx sends a page to the new reader when the request
 * carries reader_version=next, else to the legacy client). Sign in, out and switch accounts in one client, then load the other: the
 * header, saved items, history and the interface language agree, and no signed-in page of the new reader may be kept by a shared cache.
 * The second account: PLAYWRIGHT_LA_USER_HE_EMAIL (else PLAYWRIGHT_SUPERUSER_EMAIL) from the same .env. Skipped without them.
 */
const EMAIL_B = process.env.PLAYWRIGHT_LA_USER_HE_EMAIL || env.PLAYWRIGHT_LA_USER_HE_EMAIL || env.PLAYWRIGHT_SUPERUSER_EMAIL;
const PASSWORD_B = process.env.PLAYWRIGHT_LA_USER_HE_PASSWORD || env.PLAYWRIGHT_LA_USER_HE_PASSWORD || env.PLAYWRIGHT_SUPERUSER_PASSWORD;

// @feature ACC-007 @feature GUI-010 @feature USL-001
test.describe("signed-in state across the new and the legacy client (optin deployment)", () => {
  test.skip(!BASE || !EMAIL || !PASSWORD || !EMAIL_B || !PASSWORD_B, "needs READER_E2E_BASE_URL = an optin deployment (nodejs.mode optin, same origin as Django) and two accounts: PLAYWRIGHT_USER_EMAIL/PASSWORD and PLAYWRIGHT_LA_USER_HE_EMAIL/PASSWORD (or PLAYWRIGHT_SUPERUSER_*) in e2e-tests/.env");
  test.use({ baseURL: BASE });

  const host = () => new URL(BASE!).hostname;
  const client = async (page: import("@playwright/test").Page, which: "next" | "legacy") => {
    const ctx = page.context();
    await ctx.clearCookies({ name: "reader_version" });
    if (which === "next") await ctx.addCookies([{ name: "reader_version", value: "next", domain: host(), path: "/" }]);
  };
  const signIn = async (page: import("@playwright/test").Page, email: string, password: string) => {
    await client(page, "next");
    await page.goto("/login?next=%2FGenesis.1");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.getByLabel("Email Address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /^Log in$/ }).click();
    await expect(page).toHaveURL(/\/Genesis\.1/);
  };
  /** Who the page says is signed in: the session API both clients use (the header's source). */
  const whoami = async (page: import("@playwright/test").Page) => {
    const r = await page.request.get("/_allauth/browser/v1/auth/session");
    return r.status() === 200 ? (((await r.json()) as { data?: { user?: { email?: string } } }).data?.user?.email ?? null) : null;
  };
  const signedOutHeader = (page: import("@playwright/test").Page) => page.getByRole("banner").getByRole("link", { name: /^Sign Up$/i });
  const topSaved = async (page: import("@playwright/test").Page) => {
    const r = await page.request.get("/api/profile/user_history?saved=1&secondary=0&annotate=0&limit=1");
    return r.ok() ? ((await r.json()) as { ref: string }[])[0]?.ref ?? null : null;
  };

  test("sign in, switch clients, sign out, switch accounts: both clients agree; signed-in pages are never cacheable", async ({ page }) => {
    // A signs in on the new reader
    await signIn(page, EMAIL!, PASSWORD!);
    await expect(signedOutHeader(page)).toHaveCount(0);
    expect((await whoami(page))?.toLowerCase()).toBe(EMAIL!.toLowerCase());
    const res = await page.request.get("/Genesis.1");
    expect(res.headers()["x-served-by"]).toBeUndefined(); // the new reader's page
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    expect(res.headers().vary).toMatch(/Cookie/);
    const savedNext = await topSaved(page);
    // the legacy client: same reader, same saved items
    await client(page, "legacy");
    const legacy = await page.goto("/texts");
    expect(legacy!.headers()["x-served-by"] ?? "django").toBe("django");
    expect(legacy!.headers()["cache-control"] ?? "").not.toMatch(/\bpublic\b/);
    await expect(page.getByRole("link", { name: /^Sign Up$/i })).toHaveCount(0);
    expect(await topSaved(page)).toBe(savedNext);
    // the interface language set in the legacy client holds in the new one
    await page.goto("/interface/hebrew?next=/texts");
    await client(page, "next");
    await page.goto("/texts");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await page.goto("/interface/english?next=/texts");
    // sign out in the legacy client: the new reader is signed out
    await client(page, "legacy");
    await page.goto("/logout");
    await client(page, "next");
    await page.goto("/Genesis.1");
    await expect(signedOutHeader(page)).toBeVisible();
    expect(await whoami(page)).toBeNull();
    const out = await page.request.get("/Genesis.1");
    expect(out.headers()["cache-control"]).not.toBe("private, no-store");
    // B signs in on the new reader: the legacy client shows B, not A
    await signIn(page, EMAIL_B!, PASSWORD_B!);
    await client(page, "legacy");
    await page.goto("/texts");
    await expect(page.getByRole("link", { name: /^Sign Up$/i })).toHaveCount(0);
    expect((await whoami(page))?.toLowerCase()).toBe(EMAIL_B!.toLowerCase());
    // and B's history is B's in both clients
    const hist = async () => (await (await page.request.get("/api/profile/user_history?saved=0&secondary=0&annotate=0&limit=1")).json()) as unknown[];
    const legacyHistory = await hist();
    await client(page, "next");
    await page.goto("/history");
    expect(await hist()).toEqual(legacyHistory);
    await expect(signedOutHeader(page)).toHaveCount(0);
  });
});
