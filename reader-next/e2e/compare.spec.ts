import { readFileSync } from "node:fs";
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

/**
 * Genesis 1, Masorah vs Ta'amei Hamikra as www.sefaria.org draws it (captured 2026-11-04 from the live page, the capture script is in
 * the wiki page): for each row with a change, its insertions' and its deletions' texts. The literal "&thinsp;" / "&nbsp;" are the
 * texts' own escaped entities, shown as written (the old page does the same).
 */
const LIVE_GENESIS_1_MARKS = (JSON.parse(readFileSync(new URL("./fixtures/compare-genesis-1-marks.json", import.meta.url), "utf8")) as { marks: [string, string, string][] }).marks;

/** Where each character of a segment's text without its tags sits in the raw text (the old DiffStore's mapping). */
const rawIndex = (raw: string, filteredIndex: number) => {
  let seen = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "<") {
      i = raw.indexOf(">", i);
      continue;
    }
    if (seen === filteredIndex) return i;
    seen++;
  }
  return raw.length;
};

const table = (page: Page) => page.locator("[data-diff-table]");
/** The browser's default font with no stylesheet at all: a blank page's body. */
const browserDefaultFont = async (page: Page) => {
  const blank = await page.context().newPage();
  try {
    return await blank.evaluate(() => getComputedStyle(document.body).fontFamily);
  } finally {
    await blank.close();
  }
};
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
    await expect(page.getByLabel("Version 2:")).toHaveCount(0);
    // compare.html has no viewport meta and loads no site font
    await expect(page.locator("meta[name=viewport]")).toHaveCount(0);
    // the browser's own styles, as compare.html: its default serif at 16px (live computed "Times" on a Mac), the body's 8px margin,
    // the filters right-aligned. The default serif is the platform's ("Times New Roman" on Linux), so it is read from a blank page.
    const browserFont = await browserDefaultFont(page);
    const s = await page.evaluate(() => {
      const p = document.querySelector("[data-compare-page]")!, b = document.body;
      return { font: getComputedStyle(p).fontFamily, bodyFont: getComputedStyle(b).fontFamily, size: getComputedStyle(p).fontSize, margin: getComputedStyle(b).margin, x: p.getBoundingClientRect().x };
    });
    expect(s).toEqual({ font: browserFont, bodyFont: browserFont, size: "16px", margin: "8px", x: 8 });
    const ref = await page.getByLabel("Ref:").boundingBox();
    expect(Math.round(ref!.width)).toBe(308); // style="width: 300px" plus the input's own border and padding (live 308)
    // direction: rtl, as live: the first checkbox (י) at the right edge, the last ")" leftmost, Update at the right. Measured on a Mac;
    // the labels are in the browser's default serif, whose widths differ a little by platform (Linux CI: 1101, not 1100), so within 2px
    const edges = async (l: ReturnType<Page["locator"]>, expected: [number, number]) => {
      const b = (await l.boundingBox())!;
      const got = [b.x, b.x + b.width];
      expect(got.every((v, i) => Math.abs(v - expected[i]!) <= 2), `edges ${got.map(Math.round)} ≈ ${expected}`).toBe(true);
    };
    await edges(page.locator("#filters label").first(), [1248, 1272]);
    await edges(page.locator("#filters label").last(), [1075, 1100]);
    await edges(page.getByRole("button", { name: "Update" }), [1213, 1272]);
  });

  test("/compare/Genesis.1 without the slash is an empty form; with it, the ref and its versions", async ({ page }) => {
    // Django reads "Genesis.1" as the second version here (no ref, no language): the empty form, no versions, no next chapter, no
    // table — and no 404 (parseComparePath's unit test pins the parse itself)
    const res = await open(page, "/compare/Genesis.1");
    expect(res!.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/compare/Genesis.1");
    await expect(page.getByLabel("Ref:")).toHaveValue("");
    await expect(page.getByLabel("Language:")).toHaveValue("he");
    await expect(page.getByLabel("Version 1:")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Load Next Chapter" })).toHaveCount(0);
    await expect(table(page)).toHaveCount(0);
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

  test("the two versions side by side, segment by segment, with the changes marked exactly as on sefaria.org", async ({ page }) => {
    await open(page, DIFF);
    await expect(table(page)).toHaveCount(1);
    await expect(table(page).locator("thead td")).toHaveText(["Genesis 1", MASORAH, TAAMEI]);
    await expect(table(page).locator("tbody tr")).toHaveCount(31);
    await expect(row(page, "Genesis 1:1").locator("td").first()).toHaveText("Genesis 1:1");
    // every row with a change, its insertions and deletions and their texts (both cells), as www.sefaria.org drew them (VERIFIED 2026-11-04)
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll("tr[data-seg-ref]")]
        .map((tr) => {
          const ins = [...tr.querySelectorAll('[data-diff="ins"]')].map((e) => e.textContent ?? "");
          const del = [...tr.querySelectorAll('[data-diff="del"]')].map((e) => e.textContent ?? "");
          return [tr.getAttribute("data-seg-ref"), ins.join("|"), del.join("|")];
        })
        .filter((r) => r[1] || r[2]),
    );
    expect(marked).toEqual(LIVE_GENESIS_1_MARKS);
    // unchanged rows carry no marks at all
    await expect(row(page, "Genesis 1:1").locator("[data-diff]")).toHaveCount(0);
    const five = row(page, "Genesis 1:5");
    const cell = five.locator("td").nth(1);
    expect(await cell.evaluate((e) => [getComputedStyle(e).direction, getComputedStyle(e).textAlign])).toEqual(["rtl", "right"]);
    expect(await five.locator("td").first().evaluate((e) => getComputedStyle(e).direction)).toBe("ltr");
    const ins = await five.locator('[data-diff="ins"]').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(ins).toBe("rgb(92, 238, 92)");
    const del = await five.locator('[data-diff="del"]').first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(del).toBe("rgba(193, 66, 66, 0.5)");
    // the unchanged text in between is plain
    expect(await cell.locator("span:not([data-diff])").first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    // hovering a change says what a click would do (live: version 2's last change, ")" where version 1 has "}")
    await five.locator("td").nth(2).locator('[data-diff="ins"]').last().hover();
    await expect(five.getByText("Click to change `)` to `}`", { exact: true })).toBeVisible();
  });

  test("filters hide the chosen one-character changes on Update, and only those", async ({ page }) => {
    await open(page, DIFF);
    const backgrounds = () =>
      page.evaluate(() => [...document.querySelectorAll('[data-diff="ins"], [data-diff="del"]')].map((e) => [e.firstChild?.textContent ?? "", getComputedStyle(e).backgroundColor]));
    const before = await backgrounds();
    expect(before.length).toBe(LIVE_GENESIS_1_MARKS.reduce((n, [, i, d]) => n + (i ? i.split("|").length : 0) + (d ? d.split("|").length : 0), 0));
    expect(before.filter(([t]) => t === ")").length).toBe(6);
    expect(before.every(([, bg]) => bg !== "rgba(0, 0, 0, 0)")).toBe(true);
    await page.locator("#filters input[value=')']").check();
    expect(await backgrounds()).toEqual(before); // not until Update
    await page.getByRole("button", { name: "Update" }).click();
    // exactly the six ")" lose their colour; "(" (" (" here, two characters) and everything else keep theirs
    await expect.poll(async () => (await backgrounds()).filter(([, bg]) => bg === "rgba(0, 0, 0, 0)").map(([t]) => t)).toEqual([")", ")", ")", ")", ")", ")"]);
    const after = await backgrounds();
    after.forEach(([t, bg], i) => expect(bg, t).toBe(t === ")" ? "rgba(0, 0, 0, 0)" : before[i]![1]));
    // unchecked and updated again: back as they were
    await page.locator("#filters input[value=')']").uncheck();
    await page.getByRole("button", { name: "Update" }).click();
    await expect.poll(backgrounds).toEqual(before);
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

  test("Load Next Chapter with no language: the old page's doubled slash, read as Genesis 2's form", async ({ page }) => {
    // sefaria.org writes /compare/Genesis_2// and (nginx merging the slashes) shows Genesis 2's form there; the router collapses the
    // slash, the same page
    await open(page, "/compare/Genesis.1/");
    await page.getByRole("button", { name: "Load Next Chapter" }).click();
    await expect(page).toHaveURL(/\/compare\/Genesis_2\/{1,2}$/);
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 2");
    await expect(page.getByLabel("Version 1:").locator("option")).toHaveCount(6); // "Select a Version" and Genesis 2's five Hebrew versions (live: 6 options)
    await expect(table(page)).toHaveCount(0);
    // the address typed by hand, as the old page wrote it
    const res = await open(page, "/compare/Genesis_2//");
    expect(res!.status()).toBe(200);
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 2");
  });

  test("back and forward walk the form's addresses, the form following", async ({ page }) => {
    await open(page, "/compare/Genesis.1/");
    await page.getByLabel("Version 1:").selectOption(MASORAH);
    await page.getByLabel("Version 2:").selectOption(NIKKUD);
    await page.getByRole("button", { name: "Load Diff" }).click();
    await expect(table(page).locator("thead td")).toHaveText(["Genesis 1", MASORAH, NIKKUD]);
    await page.getByRole("button", { name: "Load Next Chapter" }).click();
    await expect(table(page).locator("thead td").first()).toHaveText("Genesis 2");
    await page.goBack();
    await expect(page).toHaveURL(/\/compare\/Genesis_1\/he\/Miqra_according_to_the_Masorah\/Tanach_with_Nikkud$/);
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 1");
    await expect(table(page).locator("thead td").first()).toHaveText("Genesis 1");
    await page.goBack();
    await expect(page).toHaveURL(/\/compare\/Genesis\.1\/$/);
    await expect(page.getByLabel("Version 1:")).toHaveValue("");
    await expect(table(page)).toHaveCount(0);
    await page.goForward();
    await expect(page.getByLabel("Version 2:")).toHaveValue(NIKKUD);
    await expect(table(page).locator("thead td").first()).toHaveText("Genesis 1");
    // "Load Diff" with nothing changed stays put (PageLoader: a new address only when something differs)
    const url = page.url();
    await page.getByRole("button", { name: "Load Diff" }).click();
    await page.waitForTimeout(300);
    expect(page.url()).toBe(url);
  });

  test("an address Django's pattern cannot match is a 404, typed or reached from the form", async ({ page }) => {
    const res = await page.goto("/compare/Genesis.1/xx/a/b/c");
    expect(res!.status()).toBe(404);
    await expect(page.locator("body")).toContainText("Not Found");
    // from the form: a ref with a slash makes such an address; the old page loaded it as a document, and so does this one (the server,
    // Django in production, answers it)
    await open(page, "/compare/Genesis.1/he/Miqra_according_to_the_Masorah/Tanach_with_Nikkud");
    await page.evaluate(() => ((window as unknown as { __samePage: boolean }).__samePage = true));
    await page.getByLabel("Ref:").fill("Genesis 1/2");
    const doc = page.waitForResponse((r) => r.request().resourceType() === "document" && r.url().includes("/compare/Genesis_1/2/"));
    await page.getByRole("button", { name: "Load Diff" }).click();
    expect((await doc).status()).toBe(404);
    await page.waitForLoadState("load");
    expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage ?? false)).toBe(false);
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
  /** The session and profile answers for a signed-in reader (staff or not); the click asks them again. */
  const signIn = async (page: Page, isStaff: boolean) => {
    await page.route(/\/_allauth\/browser\/v1\/auth\/session$/, (r) =>
      r.fulfill({ status: 200, contentType: "application/json", headers: { "set-cookie": "csrftoken=e2e-csrf; Path=/" }, body: JSON.stringify({ data: { user: { id: 7, display: "Mod" } }, meta: { is_authenticated: true } }) }),
    );
    await page.route(/\/api\/user_stats\/7/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "Mod", isStaff }) }));
  };
  const clickAChange = async (page: Page) => {
    const alert = page.waitForEvent("dialog", { timeout: 3000 }).catch(() => null);
    await row(page, "Genesis 1:5").locator('[data-diff="ins"]').first().click();
    return alert;
  };

  test("signed out: a click on a change says a moderator must sign in", async ({ page }) => {
    await page.route(/\/_allauth\/browser\/v1\/auth\/session$/, (r) => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ meta: { is_authenticated: false } }) }));
    await open(page, DIFF);
    // every native alert is recorded and dismissed: an unhandled second one blocks the page (CI, 2026-11-10: the test then timed out
    // on the locator below instead of saying why)
    const messages: string[] = [];
    page.on("dialog", (dlg) => {
      messages.push(dlg.message());
      void dlg.dismiss().catch(() => {});
    });
    await row(page, "Genesis 1:5").locator('[data-diff="ins"]').first().click();
    await expect.poll(() => messages.length).toBeGreaterThan(0);
    expect(messages[0]).toBe("Not signed in. You must be signed in as a Sefaria Moderator to use this feature.");
    await expect(page.getByRole("dialog", { name: "Change" })).toHaveCount(0);
    // one click, one alert
    await page.waitForTimeout(500);
    expect(messages).toHaveLength(1);
  });

  test("signed in but not a moderator: a click says only moderators can edit", async ({ page }) => {
    await signIn(page, false);
    await open(page, DIFF);
    const d = await clickAChange(page);
    expect(d?.message()).toBe("Only Sefaria Moderators Can Edit Texts");
    await d!.dismiss();
    await expect(page.getByRole("dialog", { name: "Change" })).toHaveCount(0);
  });

  test("a moderator applies a change: the segment's text with that one change is posted, and the row reloads with it", async ({ page }) => {
    const posted: { body: string; csrf?: string }[] = [];
    const reloads: string[] = [];
    let original: string | null = null;
    await signIn(page, true);
    await page.route(/\/api\/name\/Genesis%201%3A5\?ref_only=1$/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ is_ref: true, is_segment: true, url: "Genesis.1.5" }) }));
    await page.route((u) => u.pathname === "/api/texts/Genesis.1.5" && /localhost/.test(u.host), async (r) => {
      if (r.request().method() !== "POST") return r.fallback();
      posted.push({ body: r.request().postData() ?? "", csrf: r.request().headers()["x-csrftoken"] });
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) });
    });
    // the texts the row reloads (in the browser; the first paint's came with the page): the Masorah answers with the text as posted
    await page.route((u) => u.pathname === "/api/texts/Genesis.1", async (r) => {
      const url = r.request().url();
      reloads.push(url);
      const res = await r.fetch();
      const body = (await res.json()) as { he: string[] };
      if (/vhe=Miqra_according_to_the_Masorah/.test(url)) {
        original = body.he[4]!;
        if (posted[0]) body.he[4] = JSON.parse(new URLSearchParams(posted[0].body).get("json")!).text;
      }
      await r.fulfill({ response: res, json: body });
    });
    await open(page, DIFF);
    const five = row(page, "Genesis 1:5");
    const v1Cell = five.locator("td").nth(1);
    // the change clicked: version 1's last insertion with text (the "}", after the <small> and <span> tags: a position that only the
    // tag mapping gets right), and how much of the cell's text comes before it
    const target = v1Cell.locator('[data-diff="ins"]').filter({ hasText: /\S/ }).last();
    const { before, text } = await target.evaluate((el) => {
      let n = 0;
      for (let e = el.previousElementSibling; e; e = e.previousElementSibling) n += (e.firstChild?.textContent ?? "").length;
      return { before: n, text: el.firstChild!.textContent! };
    });
    await target.click();
    const dialog = page.getByRole("dialog", { name: "Change" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Changing ${text} to `);
    await dialog.getByLabel("Replacement Text:").fill("Z");
    await dialog.getByRole("button", { name: "Apply Change" }).click();
    await expect.poll(() => posted.length).toBe(1);
    const json = JSON.parse(new URLSearchParams(posted[0]!.body).get("json")!);
    expect(json.versionTitle).toBe(MASORAH);
    expect(json.language).toBe("he");
    expect(posted[0]!.csrf).toBe("e2e-csrf");
    // both versions reloaded, then the posted text is exactly the original with that one piece replaced, where it was
    await expect.poll(() => reloads.length).toBeGreaterThanOrEqual(2);
    expect(original).not.toBeNull();
    expect(original!).toMatch(/<small>/); // tags (<small>, <span>, <br>): the cell's positions are mapped back into the raw text
    const at = rawIndex(original!, before);
    expect(at).toBeGreaterThan(before);
    expect(original!.slice(at, at + text.length)).toBe(text);
    expect(json.text).toBe(original!.slice(0, at) + "Z" + original!.slice(at + text.length));
    // the dialog went with the reload, and the row now shows the new text
    await expect(dialog).toHaveCount(0);
    await expect(v1Cell).toContainText("Z");
    await expect(v1Cell.locator('[data-diff="ins"]', { hasText: "Z" })).toHaveCount(1);
  });
});

// @feature LEG-010 @feature LEG-031
test.describe("Hebrew interface", () => {
  test("the page stays English and left-to-right, as on sefaria.org", async ({ page }) => {
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, DIFF);
    expect(await page.evaluate(() => [document.documentElement.lang, document.documentElement.getAttribute("dir")])).toEqual(["he", null]);
    await expect(page.getByLabel("Ref:")).toHaveValue("Genesis 1");
    await expect(page.getByRole("button", { name: "Load Diff" })).toBeVisible();
    // the body in the browser's own font (live: "Times" on a Mac), not the Hebrew interface's
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toBe(await browserDefaultFont(page));
    // form and table start at the left; the filters and Update stay at the right (their own direction: rtl), as in English
    const ref = await page.getByLabel("Ref:").boundingBox();
    expect(Math.round(ref!.x)).toBe(36); // "Ref:" then the input (live 36)
    expect(await page.locator("form").evaluate((e) => getComputedStyle(e).direction)).toBe("ltr");
    const update = await page.getByRole("button", { name: "Update" }).boundingBox();
    expect(Math.round(update!.x + update!.width)).toBe(1272);
    const first = await table(page).locator("thead td").first().boundingBox();
    expect(Math.round(first!.x)).toBeLessThan(30);
    // the cells: the ref column left-to-right, the Hebrew texts right-to-left and right-aligned
    const five = row(page, "Genesis 1:5");
    expect(await five.locator("td").first().evaluate((e) => getComputedStyle(e).direction)).toBe("ltr");
    for (const i of [1, 2]) expect(await five.locator("td").nth(i).evaluate((e) => [getComputedStyle(e).direction, getComputedStyle(e).textAlign])).toEqual(["rtl", "right"]);
  });
});

// @feature LEG-010 @feature LEG-031
test.describe("phone @mobile", () => {
  test("no viewport meta, so laid out 980px wide (as compare.html), and scrolls", async ({ page, isMobile }) => {
    test.skip(isMobile === false, "phone only");
    await open(page, DIFF);
    await expect(page.locator("meta[name=viewport]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(980);
    await expect(table(page).locator("tbody tr")).toHaveCount(31);
    await row(page, "Genesis 1:31").scrollIntoViewIfNeeded();
    await expect(row(page, "Genesis 1:31")).toBeInViewport();
  });

  test("in the Hebrew interface too: left-to-right, 980px wide", async ({ page, isMobile }) => {
    test.skip(isMobile === false, "phone only");
    await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
    await open(page, DIFF);
    expect(await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.getAttribute("dir")])).toEqual([980, null]);
    const ref = await page.getByLabel("Ref:").boundingBox();
    expect(Math.round(ref!.x)).toBe(36);
    expect(await row(page, "Genesis 1:5").locator("td").nth(1).evaluate((e) => getComputedStyle(e).direction)).toBe("rtl");
  });
});
