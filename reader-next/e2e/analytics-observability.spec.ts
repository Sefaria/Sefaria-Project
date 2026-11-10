import { devices, expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

type Logged = { channel: string; name: string; params?: Record<string, unknown> };
const log = (page: Page) => page.evaluate(() => (window as unknown as { __SEFARIA_ANALYTICS__?: Logged[] }).__SEFARIA_ANALYTICS__ ?? []);

/** The page's runtime config with an error endpoint, as a deployment with PUBLIC_ERROR_ENDPOINT set would write it. */
async function withErrorEndpoint(page: Page, pathname: string, endpoint = "/__test/errors") {
  await page.route(
    (url) => url.pathname === pathname,
    async (route) => {
      if (route.request().resourceType() !== "document") return route.fallback();
      const res = await route.fetch();
      // where the server writes the key when PUBLIC_ERROR_ENDPOINT is set (src/lib/config.ts), so the hydrating client's config script matches
      const html = (await res.text()).replace(/(window\.__SEFARIA_CONFIG__=\{.*?"labs":\[[^\]]*\],)/, `$1"errorEndpoint":${JSON.stringify(endpoint)},`);
      await route.fulfill({ response: res, body: html });
    },
  );
}

/** Every error beacon the page sends (intercepted: nothing leaves the browser). */
async function captureBeacons(page: Page, endpoint = "/__test/errors") {
  const beacons: Record<string, unknown>[] = [];
  await page.route(`**${endpoint}`, async (route) => {
    beacons.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 204 });
  });
  return beacons;
}

// @feature ANL-017
test.describe("browser error reports", () => {
  test("an induced error and an unhandled rejection are beaconed with the agreed fields, without query or text", async ({ page }) => {
    await withErrorEndpoint(page, "/Genesis.1");
    const beacons = await captureBeacons(page);
    await open(page, "/Genesis.1?lang=bi&with=Rashi");
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("induced failure at /search?q=secret-words for reader@example.com");
      });
      void Promise.reject(new TypeError("induced rejection"));
    });
    await expect.poll(() => beacons.length).toBe(2);
    const byKind = Object.fromEntries(beacons.map((b) => [b.kind, b]));
    expect(byKind.error).toMatchObject({ v: 1, kind: "error", message: "Error: induced failure at /search for [email]", route: "reader", path: "/Genesis.1", signedIn: false, ua: "chrome-desktop", sampleRate: 1 });
    expect(byKind.unhandledrejection).toMatchObject({ message: "TypeError: induced rejection", route: "reader", path: "/Genesis.1" });
    expect(String(byKind.error!.stack)).toContain("induced failure");
    // never the page's query, the query in the message, an e-mail, or the text on screen
    expect(JSON.stringify(beacons)).not.toMatch(/lang=bi|with=Rashi|secret-words|reader@example|In the beginning/);
  });

  test("without PUBLIC_ERROR_ENDPOINT nothing is sent", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => r.method() === "POST" && sent.push(r.url()));
    await open(page, "/texts");
    await page.evaluate(() => setTimeout(() => {
      throw new Error("not reported");
    }));
    await page.waitForTimeout(500);
    expect(sent).toEqual([]);
  });
});

// @feature ANL-010
test.describe("page-type dimension", () => {
  test("dimension5 is set on GTM's ga tracker as the old client did, and the GA4 events are unchanged", async ({ page }) => {
    // GTM's ga shim, as on sefaria.org (a tracker named by GTM): recorded, nothing sent
    await page.addInitScript(() => {
      const calls: unknown[][] = [];
      (window as unknown as { __ga: unknown[][] }).__ga = calls;
      (window as unknown as { ga: unknown }).ga = Object.assign((...a: unknown[]) => void calls.push(a), { getAll: () => [{ get: () => "gtm1" }] });
    });
    await open(page, "/Genesis.1");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __ga: unknown[][] }).__ga.filter((c) => c[0] === "gtm1.set"))).toEqual([["gtm1.set", "dimension5", "Text"]]);
    // (the header's links are full loads of the site's pages in tests, so another page is opened directly)
    await open(page, "/texts");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __ga: unknown[][] }).__ga.filter((c) => c[0] === "gtm1.set"))).toEqual([["gtm1.set", "dimension5", "navigation"]]);
    // a set is not an event: the GA4 channel has no new name
    expect((await log(page)).filter((e) => e.channel === "gtag").map((e) => e.name)).not.toContain("dimension5");
  });
});

/** Records gtag calls across a reload (the "back to classic" event is sent just before the page reloads). */
async function recordGtag(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { gtag: unknown }).gtag = (...a: unknown[]) => {
      try {
        const k = "__test_gtag";
        sessionStorage.setItem(k, JSON.stringify([...JSON.parse(sessionStorage.getItem(k) ?? "[]"), a]));
      } catch {
        /* ignore */
      }
    };
  });
  return async () => page.evaluate(() => JSON.parse(sessionStorage.getItem("__test_gtag") ?? "[]") as unknown[][]);
}

// @feature ACC-003
test.describe("the opt-in's menu items", () => {
  test("absent for a reader who did not opt in", async ({ page }) => {
    await open(page, "/texts");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("dialog", { name: "Account menu" }).getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to the classic reader" })).toHaveCount(0);
  });

  test("Report a problem opens the feedback form and reports; Back to the classic reader posts the choice, clears the cookie, reloads", async ({ page, context }) => {
    await context.addCookies([
      { name: "reader_version", value: "next", domain: "localhost", path: "/" },
      { name: "csrftoken", value: "test-token", domain: "localhost", path: "/" },
    ]);
    const gtagCalls = await recordGtag(page);
    const posts: { url: string; body: unknown; csrf?: string }[] = [];
    await page.route("**/api/reader-choice", async (route) => {
      posts.push({ url: route.request().url(), body: route.request().postDataJSON(), csrf: route.request().headers()["x-csrftoken"] });
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
    });
    const feedback: string[] = [];
    await page.route("**/api/send_feedback", async (route) => {
      feedback.push(new URLSearchParams(route.request().postData() ?? "").get("json") ?? "");
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
    });
    await open(page, "/texts");

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("dialog", { name: "Account menu" }).getByRole("button", { name: "Report a problem" }).click();
    const dialog = page.getByRole("dialog", { name: "Report a problem" });
    await dialog.getByRole("combobox", { name: "Select Type" }).selectOption("bug_report");
    await dialog.getByRole("textbox", { name: "Describe the issue..." }).fill("The sidebar did not open");
    await dialog.getByRole("textbox", { name: "Email Address" }).fill("reader@example.com");
    await dialog.getByRole("button", { name: "Submit" }).click();
    await expect(dialog.getByText("Feedback sent!")).toBeVisible();
    expect(JSON.parse(feedback[0]!)).toMatchObject({ type: "bug_report", msg: "[New reader] The sidebar did not open", email: "reader@example.com" });
    await dialog.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Account menu" }).click();
    await Promise.all([page.waitForEvent("load"), page.getByRole("dialog", { name: "Account menu" }).getByRole("button", { name: "Back to the classic reader" }).click()]);
    expect(posts).toEqual([{ url: expect.stringMatching(/\/api\/reader-choice$/), body: { reader: "legacy" }, csrf: "test-token" }]);
    expect((await context.cookies()).find((c) => c.name === "reader_version")).toBeUndefined();
    const events = (await gtagCalls()).filter((c) => c[0] === "event").map((c) => [c[1], c[2]]);
    expect(events).toEqual(expect.arrayContaining([
      ["reader_report_problem", { source: "account_menu" }],
      ["reader_back_to_classic", { source: "account_menu", transport_type: "beacon" }],
    ]));
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, userAgent: devices["Pixel 7"].userAgent, isMobile: true, hasTouch: true });
    test("the phone menu has both items", async ({ page, context }) => {
      await context.addCookies([{ name: "reader_version", value: "next", domain: "localhost", path: "/" }]);
      await open(page, "/texts");
      await page.getByRole("button", { name: "Menu" }).click();
      const nav = page.getByRole("navigation", { name: "Mobile navigation menu" });
      await expect(nav.getByRole("button", { name: "Report a problem" })).toBeVisible();
      await expect(nav.getByRole("button", { name: "Back to the classic reader" })).toBeVisible();
    });
  });
});

// @feature GUI-007
test.describe("cookie notice (master #3948)", () => {
  test.describe("phone", () => {
    test.use({ viewport: { width: 412, height: 839 }, userAgent: devices["Pixel 7"].userAgent, isMobile: true, hasTouch: true });
    test("a full-width bar on the bottom edge; the page's end and the phone menu's end stay above it; the assistant button is lifted", async ({ page }) => {
      await open(page, "/texts", { cookieNotice: true });
      const notice = page.getByTestId("cookie-notice");
      await expect(notice).toBeVisible();
      const box = (await notice.boundingBox())!;
      expect([box.x, Math.round(box.y + box.height), box.width]).toEqual([0, 839, 412]);
      const vars = () => page.evaluate(() => ({ bar: document.documentElement.style.getPropertyValue("--bottom-bar-height"), launcher: getComputedStyle(document.documentElement).getPropertyValue("--lc-launcher-bottom-offset").trim() }));
      await expect.poll(vars).toEqual({ bar: `${Math.round(box.height)}px`, launcher: `${Math.round(box.height)}px` });
      // scrolled to the end, the page's last content ends above the bar
      await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
      const lastBottom = await page.evaluate(() => {
        const main = document.getElementById("main")!;
        return main.getBoundingClientRect().bottom;
      });
      expect(lastBottom).toBeLessThanOrEqual(box.y + 1);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.getByRole("button", { name: "Menu" }).click();
      const menuPad = await page.locator("#mobile-nav").evaluate((el) => getComputedStyle(el).paddingBottom);
      expect(menuPad).toBe(`${Math.round(box.height)}px`);
      // OK gives the space back
      await page.getByRole("button", { name: "Menu" }).click();
      await notice.getByRole("button", { name: "OK" }).click();
      await expect.poll(vars).toEqual({ bar: "", launcher: "" });
    });
  });

  test("tablet and wider: a 360px card in the corner, and the assistant button is not lifted", async ({ page }) => {
    await open(page, "/texts", { cookieNotice: true });
    const notice = page.getByTestId("cookie-notice");
    const box = (await notice.boundingBox())!;
    expect([box.x, box.width, Math.round(900 - box.y - box.height)]).toEqual([10, 360, 10]);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--lc-launcher-bottom-offset").trim())).toBe("0px");
    expect(await page.locator("main").evaluate((el) => getComputedStyle(el.parentElement!).paddingBottom)).toBe("0px");
  });
});

// D-9: dark mode is off at launch, whatever the device prefers
test("the page is light even on a device that prefers dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, "/Genesis.1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
});
