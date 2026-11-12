import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { open } from "./helpers";

// /activity/<ref>/<lang>/<version>: a text's revision history (LEG-019). Its API (/api/activity/…, reader/views.py segment_history_api)
// is this branch's Django, not sefaria.org's yet, so the answer is written into the API cassette here (scripts/api-cassette.mjs).

const DIR = new URL("./.cassette/", import.meta.url).pathname;
function cassette(url: string, status: number, body: unknown) {
  mkdirSync(DIR, { recursive: true });
  const key = createHash("sha1").update(`GET ${url}\n`).digest("hex");
  const head = JSON.stringify({ method: "GET", url, status, headers: { "content-type": "application/json" } });
  writeFileSync(`${DIR}${key}.gz`, gzipSync(Buffer.concat([Buffer.from(head + "\n"), Buffer.from(JSON.stringify(body))])));
}

const item = (over: Record<string, unknown>) => ({
  rev_type: "edit text", date: "2020-01-01T00:00:00", user: { name: "Ada Reader", profileUrl: "/profile/ada-reader" }, method: null,
  ref: { en: "Genesis 1:1", he: "בראשית א׳:א׳", url: "/Genesis.1.1" }, title: null, version: "The Koren Jerusalem Bible", versionHe: "תנ״ך קורן",
  language: "en", diff_html: null, history_url: "/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible", summary: false, updates_count: null,
  linkRefs: [], noteRef: null, new: null, old: null, score: null, comment: null, sheet: null, ...over,
});

const PAGE = {
  ref: "Genesis 1:1", heRef: "בראשית א׳:א׳", url: "/Genesis.1.1", lang: "en", version: "The Koren Jerusalem Bible", versionTitleInHebrew: "תנ״ך קורן",
  filterType: null, page: 1, hasMore: true,
  items: [
    item({ diff_html: '<span>In the </span><del style="background:#ffe6e6;">begining</del><ins style="background:#e6ffe6;">beginning</ins>' }),
    item({ rev_type: "add link", ref: null, new: { refs: ["Genesis 1:1", "Rashi on Genesis 1:1:1"], type: "commentary", generated_by: "add_commentary_links" },
      linkRefs: [{ en: "Genesis 1:1", he: "בראשית א׳:א׳", url: "/Genesis.1.1" }, { en: "Rashi on Genesis 1:1:1", he: "רש״י על בראשית א׳:א׳:א׳", url: "/Rashi_on_Genesis.1.1.1" }] }),
  ],
};

test.beforeAll(() => {
  cassette("/api/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible?page=1", 200, PAGE);
  cassette("/api/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible?page=1&type=edit_text", 200, { ...PAGE, filterType: "edit_text", hasMore: false, items: [PAGE.items[0]] });
});

// @feature LEG-019 @feature RTE-018
test("revision history: title, version, the feed with its diff, filter and older pages, in the new reader", async ({ page }) => {
  await open(page, "/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible");
  await expect(page).toHaveTitle("Revision History of Genesis 1:1 (The Koren Jerusalem Bible)");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revision History of Genesis 1:1");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("The Koren Jerusalem Bible");
  const feed = page.locator("[data-revision-history] li");
  await expect(feed).toHaveCount(2);
  await expect(feed.first()).toContainText("Ada Reader edited Genesis 1:1");
  await expect(feed.first().locator("del")).toHaveText("begining");
  await expect(feed.first().locator("ins")).toHaveText("beginning");
  await expect(feed.nth(1)).toContainText("added a connection (commentary) between Genesis 1:1 and Rashi on Genesis 1:1:1");
  await expect(feed.nth(1)).toContainText("(automatic commentary link)");
  await expect(page.getByRole("link", { name: "Older Activity »" })).toHaveAttribute("href", "/activity/Genesis.1.1/en/The_Koren_Jerusalem_Bible/2");
  // the filter loads its page in the app
  await page.getByRole("combobox", { name: "Filter" }).selectOption("edit_text");
  await expect(page).toHaveURL(/\/activity\/Genesis\.1\.1\/en\/The_Koren_Jerusalem_Bible\?type=edit_text$/);
  await expect(feed).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Older Activity »" })).toHaveCount(0);
  // a ref opens in the reader, in the app
  await feed.first().getByRole("link", { name: "Genesis 1:1" }).click();
  await expect(page).toHaveURL(/\/Genesis\.1\.1/);
  await expect(page.locator("[data-django-handoff]")).toHaveCount(0);
});
