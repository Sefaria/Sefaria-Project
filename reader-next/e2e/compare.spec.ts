import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/**
 * The version-diff tool, /compare (sefaria.org's compare.html + diffPage bundle), as a reader sees it. Values VERIFIED 2026-11-04
 * against www.sefaria.org (pixel parity 0.00% at 1280 and phone, English and Hebrew interface: docs/parity/page-cmp-*).
 * "Apply Change" never reaches Django: its endpoints are answered by page.route.
 */
const MASORAH = "Miqra according to the Masorah";
const TAAMEI = "Tanach with Ta'amei Hamikra";
const NIKKUD = "Tanach with Nikkud";
const DIFF = "/compare/Genesis.1/he/Miqra_according_to_the_Masorah/Tanach_with_Ta'amei_Hamikra";

const table = (page: Page) => page.locator("[data-diff-table]");
const row = (page: Page, ref: string) => page.locator(`tr[data-seg-ref="${ref}"]`);

// @feature LEG-010 @feature RTE-019 @feature LEG-031
test.describe("the page", () => {
  test("/compare: a bare page with the filters and an empty form, no site header", async ({ page }) => {
    await open(page, "/compare");
    await expect(page).toHaveTitle("Compare");
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.locator("#filters input[type=checkbox]")).toHaveCount(7);
    await expect(page.locator("#filters")).toHaveText(`י ו " : ' ( )`);
    await expect(page.getByRole("button", { name: "Update" })).toBeVisible();
    await expect(page.getByLabel("Ref:")).toHaveValue("");
    await expect(page.getByLabel("Language:")).toHaveValue("he");
    await expect(page.getByLabel("Version 1:")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Load Diff" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load Next Chapter" })).toHaveCount(0);
    // the browser's own styles, as compare.html: Times 16px, the body's 8px margin, the filters right-aligned
    const s = await page.locator("[data-compare-page]").evaluate((e) => ({ font: getComputedStyle(e).fontFamily, size: getComputedStyle(e).fontSize, pad: getComputedStyle(e).padding }));
    expect(s.size).toBe("16px");
    expect(s.pad).toBe("8px");
    expect(s.font).not.toMatch(/Roboto|Garamond/);
    const ref = await page.getByLabel("Ref:").boundingBox();
    expect(Math.round(ref!.width)).toBe(308); // style="width: 300px" plus the input's own border and padding (live 308)
  });

  test("/compare/Genesis.1 without the slash is an empty form; with it, the ref and its versions", async ({ page }) => {
    await open(page, "/compare/Genesis.1");
    await expect(page.getByLabel("Ref:")).toHaveValue("");
    await open(page, "/compare/Genesis.1/");
    expect(new URL(page.url()).pathname).toBe("/compare/Genesis.1/");
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 1");
    const v1 = page.getByLabel("Version 1:");
    await expect(v1.locator("option").first()).toHaveText("Select a Version");
    await expect(v1.locator("option", { hasText: MASORAH })).toHaveCount(1);
    await expect(v1.locator("option", { hasText: NIKKUD })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Load Next Chapter" })).toBeVisible();
    await expect(table(page)).toHaveCount(0);
  });

  test("the two versions side by side, segment by segment, with the changes marked", async ({ page }) => {
    await open(page, DIFF);
    await expect(table(page)).toHaveCount(1);
    await expect(table(page).locator("thead td")).toHaveText(["Genesis 1", MASORAH, TAAMEI]);
    await expect(table(page).locator("tbody tr")).toHaveCount(31);
    await expect(row(page, "Genesis 1:1").locator("td").first()).toHaveText("Genesis 1:1");
    // Genesis 1:5 differs (a paseq and the closed-portion mark): marked on both sides
    const five = row(page, "Genesis 1:5");
    await expect(five.locator('[data-diff="ins"]').first()).toBeVisible();
    const cell = five.locator("td").nth(1);
    expect(await cell.evaluate((e) => [getComputedStyle(e).direction, getComputedStyle(e).textAlign])).toEqual(["rtl", "right"]);
    const ins = await five.locator('[data-diff="ins"]').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(ins).toBe("rgb(92, 238, 92)");
    // hovering a change says what a click would do
    await five.locator('[data-diff="ins"]').first().hover();
    await expect(five.getByText(/^Click to (add|remove|change) `/)).toBeVisible();
  });

  test("filters hide the chosen one-character changes on Update", async ({ page }) => {
    await open(page, DIFF);
    const filterable = page.locator('[data-diff="ins"], [data-diff="del"]').filter({ hasText: /^[יו":'()]$/ });
    await expect(filterable.first()).toBeVisible();
    const ch = (await filterable.first().textContent())!;
    const bg = () => filterable.first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const before = await bg();
    await page.locator(`#filters input[value='${ch === "'" ? "\\'" : ch}']`).check();
    expect(await bg()).toBe(before); // not until Update
    await page.getByRole("button", { name: "Update" }).click();
    await expect.poll(bg).toBe("rgba(0, 0, 0, 0)");
  });
});

// @feature LEG-010 @feature RTE-019 @feature LEG-032
test.describe("choosing texts and versions", () => {
  test("Load Diff goes to the address the old page wrote", async ({ page }) => {
    await open(page, "/compare/Genesis.1/");
    await page.getByLabel("Version 1:").selectOption(MASORAH);
    await page.getByLabel("Version 2:").selectOption(NIKKUD);
    await page.getByRole("button", { name: "Load Diff" }).click();
    await expect(page).toHaveURL(/\/compare\/Genesis_1\/he\/Miqra_according_to_the_Masorah\/Tanach_with_Nikkud$/);
    await expect(table(page).locator("thead td")).toHaveText(["Genesis 1", MASORAH, NIKKUD]);
  });

  test("the version lists follow the language and the ref typed", async ({ page }) => {
    await open(page, "/compare/Genesis.1/");
    await page.getByLabel("Language:").selectOption("en");
    await expect(page.getByLabel("Version 1:").locator("option", { hasText: MASORAH })).toHaveCount(0);
    await expect(page.getByLabel("Version 1:").locator("option", { hasText: "The Contemporary Torah, Jewish Publication Society, 2006" })).toHaveCount(1);
    await page.getByLabel("Ref:").fill("Berakhot 2a");
    await page.getByLabel("Language:").selectOption("he");
    await expect(page.getByLabel("Version 1:").locator("option", { hasText: "William Davidson Edition - Vocalized Aramaic" })).toHaveCount(1);
    await page.getByLabel("Ref:").fill("Not a book at all");
    await expect(page.getByLabel("Version 1:")).toHaveCount(0);
  });

  test("Load Next Chapter keeps the versions", async ({ page }) => {
    await open(page, "/compare/Genesis.1/he/Miqra_according_to_the_Masorah/Tanach_with_Nikkud");
    await page.getByRole("button", { name: "Load Next Chapter" }).click();
    await expect(page).toHaveURL(/\/compare\/Genesis_2\/he\/Miqra_according_to_the_Masorah\/Tanach_with_Nikkud$/);
    await expect(table(page).locator("thead td").first()).toHaveText("Genesis 2");
    await expect(table(page).locator("tbody tr")).toHaveCount(25);
  });

  test("a book shows its first section; a segment its section with no table; above section level, one table per section", async ({ page }) => {
    await open(page, "/compare/Genesis/he/Miqra_according_to_the_Masorah/Tanach_with_Nikkud");
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 1");
    await expect(table(page).locator("thead td").first()).toHaveText("Genesis 1");
    await open(page, "/compare/Genesis.1.3/he/Miqra_according_to_the_Masorah/Tanach_with_Nikkud");
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 1");
    await expect(table(page)).toHaveCount(0);
    await open(page, "/compare/Rashi_on_Genesis.1/he/Pentateuch_with_Rashi's_commentary_by_M._Rosenbaum_and_A.M._Silbermann,_1929-1934/On_Your_Way");
    await expect(page.getByLabel("Ref:")).toHaveValue("Rashi on Genesis 1:1");
    await expect(table(page)).toHaveCount(31, { timeout: 30_000 });
    await expect(table(page).first().locator("thead td").first()).toHaveText("Rashi on Genesis 1:1");
    await expect(row(page, "Rashi on Genesis 1:2:1")).toBeVisible();
  });
});

// @feature LEG-010
test.describe("Apply Change (moderators)", () => {
  test("signed out: a click on a change says a moderator must sign in", async ({ page }) => {
    await page.route(/\/_allauth\/browser\/v1\/auth\/session$/, (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ meta: { is_authenticated: false } }) }));
    await open(page, DIFF);
    const msg = page.waitForEvent("dialog");
    await row(page, "Genesis 1:5").locator('[data-diff="ins"]').first().click();
    const d = await msg;
    expect(d.message()).toBe("Not signed in. You must be signed in as a Sefaria Moderator to use this feature.");
    await d.dismiss();
    await expect(page.getByRole("dialog", { name: "Change" })).toHaveCount(0);
  });

  test("a moderator applies a change: the segment's new text is posted to the version", async ({ page }) => {
    const posted: { url: string; body: string; csrf?: string }[] = [];
    await page.route(/\/_allauth\/browser\/v1\/auth\/session$/, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: { "set-cookie": "csrftoken=e2e-csrf; Path=/" }, body: JSON.stringify({ data: { user: { id: 7, display: "Mod" } }, meta: { is_authenticated: true } }) }),
    );
    await page.route(/\/api\/user_stats\/7/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "Mod", isStaff: true }) }));
    await page.route(/\/api\/name\/Genesis%201%3A5\?ref_only=1$/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ is_ref: true, is_segment: true, url: "Genesis.1.5" }) }));
    await page.route((u) => u.pathname === "/api/texts/Genesis.1.5" && /localhost/.test(u.host), async (r) => {
      if (r.request().method() !== "POST") return r.fallback();
      posted.push({ url: r.request().url(), body: r.request().postData() ?? "", csrf: r.request().headers()["x-csrftoken"] });
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
    });
    await open(page, DIFF);
    const five = row(page, "Genesis 1:5");
    const change = five.locator("td").nth(1).locator('[data-diff="ins"]').first();
    await change.click();
    const dialog = page.getByRole("dialog", { name: "Change" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^Changing /)).toBeVisible();
    await dialog.getByLabel("Replacement Text:").fill("Z");
    await dialog.getByRole("button", { name: "Apply Change" }).click();
    await expect.poll(() => posted.length).toBe(1);
    const json = JSON.parse(new URLSearchParams(posted[0]!.body).get("json")!);
    expect(json.versionTitle).toBe(MASORAH);
    expect(json.language).toBe("he");
    expect(json.text).toContain("Z");
    expect(posted[0]!.csrf).toBe("e2e-csrf");
    // the row reloads (the dialog goes with it)
    await expect(dialog).toHaveCount(0);
    await expect(five).toBeVisible();
  });
});

// @feature LEG-010 @feature LEG-031
test.describe("Hebrew interface", () => {
  test("the page stays English and left-to-right, as on sefaria.org", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, DIFF);
    expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.getAttribute("dir")])).toEqual(["he", null]);
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 1");
    const ref = await page.getByLabel("Ref:").boundingBox();
    expect(ref!.x).toBeLessThan(100); // the form starts at the left
    await expect(table(page).locator("thead td").first()).toHaveText("Genesis 1");
    const first = await table(page).locator("thead td").first().boundingBox();
    expect(first!.x).toBeLessThan(30);
  });
});

// @feature LEG-010 @feature LEG-031
test.describe("phone @mobile", () => {
  test("laid out 980px wide like any page without a viewport meta, and scrolls", async ({ page, isMobile }) => {
    test.skip(isMobile === false, "phone only");
    await open(page, DIFF);
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(980);
    await expect(table(page).locator("tbody tr")).toHaveCount(31);
    await row(page, "Genesis 1:31").scrollIntoViewIfNeeded();
    await expect(row(page, "Genesis 1:31")).toBeInViewport();
  });
});
