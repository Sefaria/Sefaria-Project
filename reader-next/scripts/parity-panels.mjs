// Multi-panel parity: the same clicks on www.sefaria.org and on this client (docs/MULTIPANEL_PLAN.md, Step 0).
//   node scripts/parity-panels.mjs [scenario …] [--base=http://localhost:3100]
// After every step it compares: the address (decoded), the boxes on screen in order (a text panel's column, a sidebar) with their
// widths (±4px), and which boxes are sidebars. The live site is the reference; our side is expected to equal it.
// Desktop 1440×900 (the live site decides single/multi panel from the User-Agent; a desktop UA here).
import { chromium } from "playwright";

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3100").slice(7);
const only = args.filter((a) => !a.startsWith("--"));
const LIVE = "https://www.sefaria.org";

// ── what is on screen ────────────────────────────────────────────────────────────────────────────────────
const liveBoxes = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll(".readerPanelBox")].map((b) => {
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left), w: Math.round(r.width), sidebar: b.classList.contains("sidebar") };
    }),
  );
const ourBoxes = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("[data-panel-id]")].flatMap((s) =>
      [...s.querySelectorAll("[data-leaf]")].map((l) => {
        const r = l.getBoundingClientRect();
        return { x: Math.round(r.left), w: Math.round(r.width), sidebar: l.getAttribute("data-leaf") !== "main" };
      }),
    ),
  );
const addr = (p, origin) => decodeURIComponent(p.url().replace(origin, "")).replace(/\+/g, " ");

// ── the clicks, written once per side ─────────────────────────────────────────────────────────────────────
const L = {
  verse: (p, panel, ref) => p.locator(".readerPanelBox").nth(panel).locator(`.segment[data-ref='${ref}']`).first().click(),
  category: (p, name) => p.locator(".readerPanelBox.sidebar .categoryFilter", { hasText: name }).first().click(),
  book: (p, name) => p.locator(".readerPanelBox.sidebar .textFilter", { hasText: name }).first().click(),
  openFirst: (p) => p.locator(".readerPanelBox.sidebar a", { hasText: /^Open$/ }).first().click(),
  citation: (p, panel, ref) => p.locator(".readerPanelBox").nth(panel).locator(`a.refLink[data-ref='${ref}']`).first().click(),
  sidebarCitation: (p, ref) => p.locator(`.readerPanelBox.sidebar a.refLink[data-ref='${ref}']`).first().click(),
  previewTranslation: (p, n) => p.locator(".readerPanelBox.sidebar .versionPreviewWithOptionalEllipsis").nth(n).click(),
  openTranslation: (p) => p.locator(".readerPanelBox.sidebar").getByText(/^Open Text$|^Open$/).first().click(),
  tool: (p, name) => p.locator(".readerPanelBox.sidebar .toolsButton", { hasText: name }).first().click(),
};
const O = {
  verse: (p, panel, ref) => p.locator("[data-panel-id]").nth(panel).locator(`[role="group"][data-ref='${ref}']`).first().click(),
  category: (p, name) => p.locator('[data-leaf]:not([data-leaf="main"])').getByRole("link", { name: new RegExp(`^${name}`) }).first().click(),
  book: (p, name) => p.locator('[data-leaf]:not([data-leaf="main"])').getByRole("link", { name: new RegExp(`^${name}`) }).first().click(),
  openFirst: (p) => p.locator('[data-leaf]:not([data-leaf="main"])').getByRole("link", { name: "Open", exact: true }).first().click(),
  citation: (p, panel, ref) => p.locator("[data-panel-id]").nth(panel).locator(`[data-leaf="main"] a.ref-link[data-sefaria-ref='${ref}']`).first().click(),
  sidebarCitation: (p, ref) => p.locator(`[data-leaf]:not([data-leaf="main"]) a[data-ref='${ref}'], [data-leaf]:not([data-leaf="main"]) a.ref-link[data-sefaria-ref='${ref}']`).first().click(),
  previewTranslation: (p, n) => p.locator('[data-leaf]:not([data-leaf="main"])').getByRole("link", { name: /^Preview / }).nth(n).click(),
  openTranslation: (p) => p.locator('[data-leaf]:not([data-leaf="main"])').getByRole("link", { name: "Open", exact: true }).first().click(),
  tool: (p, name) => p.locator('[data-leaf]:not([data-leaf="main"])').getByRole("link", { name: new RegExp(`^${name}`) }).first().click(),
};

// ── scenarios: [label, (side, page) => action] … ; side is L or O ─────────────────────────────────────────
const S = {
  "open-from-sidebar": ["/Genesis.1", [
    ["verse 1", (s, p) => s.verse(p, 0, "Genesis 1:1")],
    ["Commentary", (s, p) => s.category(p, "Commentary")],
    ["Rashi", (s, p) => s.book(p, "Rashi")],
    ["Open (first)", (s, p) => s.openFirst(p)],
  ]],
  "sidebar-on-panel-1-of-2": ["/Genesis.1?p2=Exodus.1", [["verse in panel 1", (s, p) => s.verse(p, 0, "Genesis 1:1")]]],
  "sidebar-on-panel-2-of-2": ["/Genesis.1?p2=Exodus.1", [["verse in panel 2", (s, p) => s.verse(p, 1, "Exodus 1:1")]]],
  "citation": ["/Ramban_on_Genesis.1.1", [
    ["citation Exodus 12:2", (s, p) => s.citation(p, 0, "Exodus 12:2")],
    ["citation Exodus 20:10 (replaces panel 2)", (s, p) => s.citation(p, 0, "Exodus 20:10")],
  ]],
  "citation-replaces-reader-panel": ["/Ramban_on_Genesis.1.1?p2=Exodus.1", [["citation in panel 1", (s, p) => s.citation(p, 0, "Exodus 12:2")]]],
  "translation-open-text": ["/Genesis.1.1?with=Translations", [
    ["preview a translation", (s, p) => s.previewTranslation(p, 1)],
    ["Open Text", (s, p) => s.openTranslation(p)],
  ]],
  "lexicon-citation": [`/Genesis.1.1?with=Lexicon&lookup=${encodeURIComponent("בראשית")}`, [["citation Genesis 1:1 in an entry", (s, p) => s.sidebarCitation(p, "Genesis 1:1")]]],
  "compare": ["/Genesis.1.1?with=all", [["Compare Text", (s, p) => s.tool(p, "Compare Text")]]],
};

// ── run ───────────────────────────────────────────────────────────────────────────────────────────────────
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([
  { name: "interfaceLang", value: "english", domain: ".sefaria.org", path: "/" },
  { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" },
  { name: "cookiesNotificationAccepted", value: "1", domain: new URL(BASE).hostname, path: "/" },
]);
const live = await ctx.newPage(), ours = await ctx.newPage();
const tidy = (p) => p.evaluate(() => document.querySelectorAll("#interruptingMessageOverlay, #interruptingMessageBox, #bannerMessage").forEach((e) => e.remove()));
const settle = (p) => p.waitForTimeout(4500);
const same = (a, o) => a.length === o.length && a.every((x, i) => x.sidebar === o[i].sidebar && Math.abs(x.w - o[i].w) <= 4 && Math.abs(x.x - o[i].x) <= 4);
const fmt = (bs) => bs.map((x) => `${x.x}+${x.w}${x.sidebar ? "s" : ""}`).join(" ");
let bad = 0;
for (const [name, [start, steps]] of Object.entries(S)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`\n### ${name}  (${start})`);
  await live.goto(LIVE + start, { waitUntil: "domcontentloaded" });
  await ours.goto(BASE + start);
  await ours.waitForSelector("html[data-hydrated='true']").catch(() => {});
  await settle(live); await settle(ours); await tidy(live);
  for (const [label, act] of [["(start)", null], ...steps]) {
    let err = "";
    if (act) {
      try { await act(L, live); } catch (e) { err += ` live-failed: ${String(e).split("\n")[0].slice(0, 90)}`; }
      try { await act(O, ours); } catch (e) { err += ` ours-failed: ${String(e).split("\n")[0].slice(0, 90)}`; }
      await settle(live); await settle(ours); await tidy(live);
    }
    const [ua, uo, ba, bo] = [addr(live, LIVE), addr(ours, BASE), await liveBoxes(live), await ourBoxes(ours)];
    const ok = ua === uo && same(ba, bo) && !err;
    if (!ok) bad++;
    console.log(`${ok ? "SAME" : "DIFF"}  ${label}${err}`);
    if (ua !== uo) console.log(`   url  live ${ua}\n        ours ${uo}`);
    if (!same(ba, bo)) console.log(`   boxes live ${fmt(ba)}\n         ours ${fmt(bo)}`);
  }
}
await b.close();
console.log(bad ? `\n${bad} steps differ` : "\nall same");
process.exitCode = bad ? 1 : 0;
