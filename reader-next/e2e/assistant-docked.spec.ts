import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/*
 * The Library Assistant docked ("Maximize & move to sidebar"): a full-height column beside the page, which narrows to make room,
 * as on sefaria.org, where <lc-chatbot> sits in #main's flex row beside .panelContainer. The real widget is another team's script
 * the suite never loads, so a stand-in defines <lc-chatbot> with the layout rules the widget's build carries for docked mode (its
 * `:host(:has(.mode-docked.is-open))` height and its container's static, column layout under --lc-docked-top-offset).
 *
 * Measured on www.sefaria.org with the real widget (2026-11-18, Playwright, 1400x900, English): the chat 300px wide at x=1090, y=60,
 * 816px tall; one panel 1080px wide, two 540 + 539; in Hebrew the column is on the left. At 800px the column stays in view as the
 * page scrolls. This client matched every one of those numbers with the real widget; this spec keeps the layout from regressing.
 */
const STAND_IN = `
customElements.define("lc-chatbot", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = \`<style>
      :host(:has(.c.mode-docked.is-open)) { height: 100%; min-height: 0; max-height: 100%; }
      .c { position: fixed; inset-inline-end: 24px; bottom: 24px; }
      .c.mode-docked.is-open { position: static; width: 320px; margin-top: var(--lc-docked-top-offset); height: calc(100% - var(--lc-docked-top-offset));
        max-height: calc(100% - var(--lc-docked-top-offset)); min-height: 0; padding-bottom: 24px; box-sizing: border-box; display: flex; flex-direction: column; }
      .p { flex: 1 1 0; min-height: 0; width: 300px; margin-inline: 10px; background: #eee; }
    </style><div class="c mode-docked is-open"><div class="p" data-chat></div></div>\`;
  }
});`;

async function openDocked(page: Page, path: string) {
  await page.context().route("**/lc-chatbot.umd.cjs", (r) => r.fulfill({ contentType: "text/javascript", body: STAND_IN }));
  await open(page, path, { assistantScript: true });
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"]').first()).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(() => document.querySelector("lc-chatbot")?.shadowRoot?.querySelector("[data-chat]"));
}

const box = (page: Page, js: string) =>
  page.evaluate((code) => {
    const el = new Function(`return ${code}`)() as Element;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }, js);
const CHAT = `document.querySelector("lc-chatbot").shadowRoot.querySelector("[data-chat]")`;

// @feature AI-011
test("docked on a wide screen: a full-height column on the right; the reader narrows beside it, two panels share what is left", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 1400, height: 900 });
  await openDocked(page, "/Genesis.1?lang=bi&p2=Exodus.1&lang2=bi");
  expect(await box(page, CHAT)).toEqual({ x: 1090, y: 60, w: 300, h: 816 });
  const main = await box(page, `document.getElementById("main")`);
  expect(main).toMatchObject({ x: 0, y: 60, w: 1080 });
  const frames = await page.locator("[data-reader-frame]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  expect(Math.max(...frames)).toBeLessThanOrEqual(1081); // no panel runs under the chat
  expect(frames).toHaveLength(2);
});

// @feature AI-011
test("docked in the Hebrew interface: the column is on the left", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.context().addCookies([{ name: "interfaceLang", value: "hebrew", domain: "localhost", path: "/" }]);
  await openDocked(page, "/Genesis.1?lang=bi");
  expect(await box(page, CHAT)).toEqual({ x: 10, y: 60, w: 300, h: 816 });
  expect(await box(page, `document.getElementById("main")`)).toMatchObject({ x: 320, w: 1080 });
});

// @feature AI-011
test("docked at 800px, where the window scrolls: the column stays in view, under the header's 60px", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 900, "desktop project only");
  await page.setViewportSize({ width: 800, height: 900 });
  await openDocked(page, "/Genesis.1?lang=bi");
  expect(await box(page, CHAT)).toEqual({ x: 490, y: 60, w: 300, h: 816 });
  expect(await box(page, `document.getElementById("main")`)).toMatchObject({ x: 0, w: 480 });
  await page.evaluate(() => window.scrollBy(0, 1500));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  expect(await box(page, CHAT)).toEqual({ x: 490, y: 60, w: 300, h: 816 });
});
