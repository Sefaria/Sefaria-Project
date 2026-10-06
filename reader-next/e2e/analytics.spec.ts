import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

type Logged = { channel: string; name: string; params?: Record<string, unknown> };
const log = (page: Page) => page.evaluate(() => (window as unknown as { __SEFARIA_ANALYTICS__?: Logged[] }).__SEFARIA_ANALYTICS__ ?? []);
const names = async (page: Page) => (await log(page)).map((e) => `${e.channel}:${e.name}`);

// The page-load events sefaria.org sends on /Genesis.1 (recorded 2026-10-06 with scripts/probes/anl-probe.mjs), minus the
// promotions this client does not have yet (promo_viewed, modal_viewed). No vendor is configured in tests: only the log.
// @feature ANL-008 @feature ANL-003 @feature ANL-004 @feature ANL-009 @feature ANL-012 @feature ANL-015
test.describe("analytics", () => {
  test("a reader page logs the old page-load events, and nothing is sent to Google", async ({ page }) => {
    const sent: string[] = [];
    page.on("request", (r) => /^https:\/\/[^/]*(googletagmanager|google-analytics|simpleanalyticscdn|sentry\.io)/.test(r.url()) && sent.push(r.url()));
    await open(page, "/Genesis.1");
    await expect.poll(() => names(page), { timeout: 10_000 }).toEqual(expect.arrayContaining(["gtag:select_content", "sa:reader_app_mounted", "gtag:reader_app_mounted", "gtag:header_viewed", "gtag:banner_probe_viewed"]));
    const l = await log(page);
    expect(l.find((e) => e.name === "select_content")?.params).toEqual({ content_type: "Tanakh", item_id: "Genesis" });
    // the header reports; the panel's colour line too when it mounts before the header's report sets the shared session key
    expect(l.filter((e) => e.channel === "gtag" && e.name === "header_viewed").map((e) => e.params?.impression_type)).toContain("regular_header");
    expect(sent).toEqual([]);
  });

  test("once per session: a second page does not repeat the session events", async ({ page }) => {
    await open(page, "/Genesis.1");
    await expect.poll(() => names(page), { timeout: 10_000 }).toContain("gtag:banner_probe_viewed");
    await open(page, "/Exodus.1");
    await page.waitForTimeout(3500);
    const n = await names(page);
    expect(n).toContain("gtag:select_content");
    expect(n).not.toContain("gtag:reader_app_mounted");
    expect(n).not.toContain("gtag:header_viewed");
    expect(n).not.toContain("gtag:banner_probe_viewed");
  });

  test("a verse click, a tool and a category in the sidebar report the old events", async ({ page }) => {
    await open(page, "/Genesis.1");
    await page.locator('[role="group"][data-ref="Genesis 1:1"]').click();
    await page.getByRole("link", { name: /Commentary/ }).first().click();
    await expect.poll(() => names(page)).toEqual(expect.arrayContaining(["ua:Reader|Text Segment Click", "ua:Reader|Open Connections Panel", "ua:Reader|Connections Category Click"]));
    const l = await log(page);
    expect(l.find((e) => e.name === "Reader|Text Segment Click")?.params).toEqual({ label: "Genesis 1:1" });
    expect(l.find((e) => e.name === "Reader|Connections Category Click")?.params).toEqual({ label: "Commentary" });
  });

  test("the module switcher reports open and item clicks through data-anl", async ({ page }) => {
    await open(page, "/texts");
    await page.getByRole("button", { name: "Library" }).click();
    await expect.poll(() => log(page)).toContainEqual({ channel: "gtag", name: "modswitch_open", params: { feature_name: "module_switcher" } });
  });

  // @feature SRC-104 @feature SRC-105 @feature SRC-106 @feature SRC-107
  test("search funnel: started, executed with all four counts, a tab click, a result click ends the flow", async ({ page }) => {
    await open(page, "/search?q=light&tab=text");
    const byName = async (n: string) => (await log(page)).filter((e) => e.name === n).map((e) => e.params ?? {});
    await expect.poll(() => byName("search_query_executed"), { timeout: 20_000 }).toHaveLength(1);
    const [started] = await byName("search_flow_started");
    expect(started).toMatchObject({ source: "deep_link", transport_type: "beacon" });
    const [q] = await byName("search_query_executed");
    expect(q).toMatchObject({ flow_id: started!.flow_id, search_text: "light", status: "success", tab: "Sources" });
    expect(Object.keys(JSON.parse(String(q!.result_counts))).sort()).toEqual(["authors", "books", "sources", "topics"]);
    expect((await log(page)).some((e) => e.name === "Search|Query: text" && e.params?.label === "light")).toBe(true);

    await page.getByRole("link", { name: /^Topics [0-9]/ }).click();
    await expect.poll(() => byName("search_element_clicked")).toContainEqual(expect.objectContaining({ element_type: "tab", element_value: "Topics", tab: "Sources" }));
    await page.getByRole("link", { name: /^Sources [0-9]/ }).click();
    const firstResult = page.getByRole("list", { name: "Search results" }).locator("li").first();
    await firstResult.waitFor();
    await firstResult.getByRole("link").first().click();
    await expect.poll(() => byName("search_flow_ended")).toEqual([expect.objectContaining({ reason: "clicked_result", flow_id: started!.flow_id })]);
    expect((await byName("search_element_clicked")).at(-1)).toMatchObject({ element_type: "result", result_position: 1 });
  });

  test("header search to the search page: source nav_bar", async ({ page }) => {
    await open(page, "/texts");
    const box = page.getByRole("combobox").first();
    await box.fill("light");
    await box.press("Enter");
    await page.waitForURL(/\/search\?/);
    await expect.poll(async () => (await log(page)).filter((e) => e.name === "search_flow_started").map((e) => e.params?.source)).toEqual(["nav_bar"]);
  });
});

