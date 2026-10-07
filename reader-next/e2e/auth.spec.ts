import { expect, test, type Page } from "@playwright/test";
import { AUTH_BASE_URL, gtagEvents, mockEndpoint, recordGtag, withFakeProviders, type Captured } from "./auth-helpers";

/**
 * The ported auth page, signed out, against a dev server with test provider keys. Every Django endpoint is answered by
 * page.route (never a real account; nothing is sent to sefaria.org). Geometry numbers are the live site's (www.sefaria.org/login,
 * /register, 2026-10-06, 1280×900 and Pixel 7).
 */
test.use({ baseURL: AUTH_BASE_URL });

async function open(page: Page, path: string) {
  await page.context().addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
  await withFakeProviders(page);
  // the CSRF bootstrap (allauth's session GET) sets the cookie as Django would
  await page.route(/\/_allauth\/browser\/v1\/auth\/session$/, (r) =>
    r.fulfill({ status: 401, contentType: "application/json", headers: { "set-cookie": "csrftoken=e2e-csrf; Path=/" }, body: JSON.stringify({ status: 401, meta: { is_authenticated: false } }) }),
  );
  await page.goto(path);
  await page.waitForSelector("html[data-hydrated='true']");
}
const box = async (page: Page, sel: string) => {
  const b = await page.locator(sel).first().boundingBox();
  return b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
};

// @feature ACC-008 @feature ACC-012 @feature RTE-032
test.describe("looks like sefaria.org (VERIFIED 2026-10-06)", () => {
  test("/login at 1280: navy page, the card and its controls where the live site has them", async ({ page }) => {
    await open(page, "/login");
    await expect(page).toHaveTitle("Log in to Sefaria");
    await expect(page.locator("#google-signin-button [data-provider-sdk-overlay]")).toHaveCount(1);
    expect(await box(page, "[data-auth-card]")).toEqual([320, 116, 640, 535]);
    expect(await box(page, "[data-auth-card] h1")).toEqual([586, 184, 109, 47]);
    expect(await box(page, "[data-provider-button]")).toEqual([466, 294, 348, 51]);
    expect(await box(page, "[data-auth-divider]")).toEqual([466, 436, 348, 16]);
    expect(await box(page, "[data-auth-primary]")).toEqual([466, 476, 348, 51]);
    expect(await box(page, "[data-legal-text]")).toEqual([466, 551, 348, 32]);
    const s = await page.locator("[data-auth-card] h1").evaluate((e) => getComputedStyle(e));
    expect([s.fontSize, s.fontWeight, s.color]).toEqual(["40px", "400", "rgb(18, 18, 18)"]);
    const bg = await page.locator("[data-auth-page]").evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).toBe("rgb(24, 52, 93)");
  });

  test("/register email step: the fields and the captcha where the live site has them", async ({ page }) => {
    await open(page, "/register");
    await expect(page).toHaveTitle("Create an Account");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeFocused();
    expect(await box(page, "[data-auth-back]")).toEqual([352, 148, 48, 48]);
    expect(await box(page, "[data-input-control]")).toEqual([466, 314, 348, 45]);
    expect(await box(page, "[data-auth-card]")).toEqual([320, 116, 640, 823]);
  });

  test("phone @mobile: full-width card with the 30px heading", async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
    await open(page, "/login");
    expect(await box(page, "[data-auth-card]")).toEqual([32, 116, 348, 467]);
    const fs = await page.locator("[data-auth-card] h1").evaluate((e) => getComputedStyle(e).fontSize);
    expect(fs).toBe("30px");
  });
});

// @feature ACC-001 @feature ACC-007 @feature ACC-009 @feature ANL-002 @feature ANL-013 @feature RTE-052
test.describe("flows", () => {
  test("cross-links swap /login and /register in place; the header's Sign Up starts the funnel with nav_bar", async ({ page }) => {
    await recordGtag(page);
    await open(page, "/login?next=%2FGenesis.1");
    await page.getByRole("main").getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/register\?next=%2FGenesis\.1$/);
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2FGenesis\.1$/);
    await page.getByRole("banner").getByRole("link", { name: "Sign Up" }).click();
    await expect(page).toHaveURL(/\/register\?next=%2FGenesis\.1$/);
    const started = (await gtagEvents(page)).filter((e) => e[1] === "sign_up_flow_started");
    expect(started.map((e) => e[2].source)).toEqual(["login_crosslink", "nav_bar"]);
  });

  test("log in: wrong password shows the error; right password loads next", async ({ page }) => {
    const log: Captured[] = [];
    let ok = false;
    await page.route((u) => u.pathname === "/api/auth/login", async (route) => {
      log.push({ url: route.request().url(), method: "POST", headers: route.request().headers(), body: route.request().postData() });
      await route.fulfill(ok ? { status: 200, contentType: "application/json", body: "{}" } : { status: 401, contentType: "application/json", body: JSON.stringify({ error: "auth.invalid_credentials" }) });
    });
    await open(page, "/login?next=%2Ftexts");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.getByLabel("Email Address").fill("reader@example.org");
    await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert")).toContainText("Email and/or password are incorrect");
    await expect(page).toHaveURL(/\/login/);
    expect(log[0]!.headers["x-csrftoken"]).toBe("e2e-csrf");
    expect(JSON.parse(log[0]!.body!)).toEqual({ email: "reader@example.org", password: "not-a-real-password" });
    ok = true;
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/texts$/);
  });

  test("register: required fields on blur, the server's email-exists banner, then the redirect", async ({ page }) => {
    const log = await mockEndpoint(page, "/register", 200, { email: "email_exists", captcha: "invalid" });
    await open(page, "/register");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.getByLabel("Email Address").click();
    await page.keyboard.press("Tab");
    await expect(page.getByText("Required field")).toBeVisible();
    await page.getByLabel("Email Address").fill("a@example.org");
    await expect(page.getByLabel("Email Address")).not.toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Password", { exact: true }).fill("Xk7mQ9zLp2!");
    await page.getByLabel("First Name").fill("QA");
    await page.getByLabel("Last Name").fill("Test");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByRole("alert").first()).toContainText("An account with this email address already exists.");
    await expect(page.getByText("Verify that you are not a robot")).toBeVisible();
    expect(new URLSearchParams(log[0]!.body!).get("noredirect")).toBe("1");
    await page.unroute((u) => u.pathname === "/register");
    await mockEndpoint(page, "/register", 200, { redirect: "/texts" });
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/texts$/);
  });

  test("forgot password: the request, then Reset Link Sent", async ({ page }) => {
    const log = await mockEndpoint(page, "/api/auth/password/reset", 200, {});
    await open(page, "/login");
    await page.getByRole("button", { name: "Continue with Email" }).click();
    await page.getByLabel("Email Address").fill("reader@example.org");
    await page.getByRole("link", { name: "Forgot Password?" }).click();
    await expect(page.getByRole("heading", { name: "Forgot Password?" })).toBeVisible();
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await expect(page.getByRole("heading", { name: "Reset Link Sent" })).toBeVisible();
    expect(JSON.parse(log[0]!.body!)).toEqual({ email: "reader@example.org" });
  });

  // @feature ACC-011
  test("reset link: the page asks Django, then sets the password; an expired link offers a new one", async ({ page }) => {
    let expired = false;
    const bodies: string[] = [];
    await page.route((u) => u.pathname === "/password/reset/confirm/MTI/set-password/", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const b = route.request().postData() ?? "";
      bodies.push(b);
      const j = JSON.parse(b);
      if (expired && !j.action) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "x", _auth: { code: "invalid_reset_link" } }) });
      if (!j.new_password1 && !j.action) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ new_password1: "This field is required." }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await open(page, "/password/reset/confirm/MTI/set-password/");
    await expect(page).toHaveTitle("Reset Your Password");
    await page.getByLabel("New Password", { exact: true }).fill("abcdefgh12!");
    await page.getByLabel("Confirm New Password").fill("abcdefgh12!");
    await page.getByRole("button", { name: "Reset Password" }).click();
    await expect(page.getByRole("heading", { name: "Password Reset Successfully" })).toBeVisible();
    expect(bodies[0]).toBe("{}");
    expired = true;
    await open(page, "/password/reset/confirm/MTI/set-password/");
    await expect(page.getByRole("heading", { name: "Password Reset Link Expired" })).toBeVisible();
    await page.getByRole("button", { name: "Request New Link" }).click();
    await expect(page.getByRole("heading", { name: "Reset Link Sent" })).toBeVisible();
    expect(bodies.at(-1)).toBe(JSON.stringify({ action: "resend" }));
  });
});

// @feature ACC-012 @feature ACC-002 @feature ACC-013
test.describe("Google and Apple (SDKs stubbed)", () => {
  test("the real Google button is rendered inside our Continue with Google; Apple's button starts Apple sign-in", async ({ page }) => {
    await recordGtag(page);
    await open(page, "/register");
    await expect(page.locator("#google-signin-button [data-provider-sdk-overlay]")).toHaveCount(1);
    const g = await page.evaluate(() => (window as unknown as { __gsi: { initialized: Record<string, unknown>[]; lastButton: Record<string, unknown> } }).__gsi);
    expect(g.initialized[0]).toMatchObject({ client_id: "test-google-client.apps.googleusercontent.com", ux_mode: "popup", use_fedcm_for_button: true });
    expect(g.lastButton).toMatchObject({ text: "continue_with", locale: "en" });
    await page.getByRole("button", { name: "Continue with Apple" }).click();
    expect(await page.evaluate(() => (window as unknown as { __apple: { signedIn?: boolean } }).__apple.signedIn)).toBe(true);
    const chosen = (await gtagEvents(page)).find((e) => e[1] === "sign_up_method_chosen");
    expect(chosen?.[2]).toMatchObject({ method: "apple" });
  });

  test("One Tap is offered on a reader page once, never on /login", async ({ page }) => {
    await open(page, "/login");
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as { __gsi?: { prompts: number } }).__gsi?.prompts ?? 0)).toBe(0);
    await page.goto("/texts");
    await page.waitForSelector("html[data-hydrated='true']");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __gsi?: { prompts: number } }).__gsi?.prompts ?? 0), { timeout: 5000 }).toBe(1);
  });
});
