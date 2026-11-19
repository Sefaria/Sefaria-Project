import { expect, test, type Page } from "@playwright/test";
import { covering, open } from "./helpers";

/*
 * On a phone the Library Assistant opens as a sheet over the whole screen, and the navigation menu opens under the reader's top bar.
 * Measured on www.sefaria.org (2026-11-18, Playwright, 375x812 and Pixel 7, Genesis 1, signed out):
 *  - the Ask button is 98x56, 16px from the right and bottom edges; <lc-chatbot> itself is static, its container fixed at z-index
 *    10000, so the open sheet is above every bar of the page: its history, More options and Close buttons (44x44, 20px from the
 *    top) all take a tap, and Close shuts the sheet where the page was;
 *  - on a reader page the menu button is the reader's top bar's own; a tap opens the menu below the bar, a second tap on the same
 *    button closes it.
 * The real widget is another team's script the suite never loads, so a stand-in defines <lc-chatbot> with the rules its build
 * carries for a phone (the fixed container at z-index 10000, the full-screen sheet below 601px) and its chatbot:open event.
 */
const STAND_IN = `
customElements.define("lc-chatbot", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = \`<style>
      .c { position: fixed; z-index: 10000; inset-inline-end: 16px; bottom: 16px; }
      .ask { width: 98px; height: 56px; }
      .sheet { display: none; }
      .c.is-open { inset: 0; background: #fff; }
      .c.is-open .ask { display: none; }
      .c.is-open .sheet { display: block; }
      .sheet button { position: absolute; top: 20px; width: 44px; height: 44px; }
    </style><div class="c mode-fullscreen"><button class="ask" aria-label="Ask Library Assistant">Ask</button><div class="sheet">
      <button aria-label="Log in to see chat history" style="right: 100px"></button><button aria-label="More options" style="right: 56px"></button>
      <button aria-label="Close" style="right: 12px"></button><textarea aria-label="Prompt input"></textarea></div></div>\`;
    const c = this.shadowRoot.querySelector(".c");
    const setOpen = (o) => c.classList.toggle("is-open", o);
    this.shadowRoot.querySelector(".ask").addEventListener("click", () => setOpen(true));
    this.shadowRoot.querySelector('[aria-label="Close"]').addEventListener("click", () => setOpen(false));
    document.addEventListener("chatbot:open", () => setOpen(true));
  }
});`;

const shadow = (sel: string) => `document.querySelector("lc-chatbot").shadowRoot.querySelector(${JSON.stringify(sel)})`;
const isOpen = (page: Page) => page.evaluate(`${shadow(".c")}.classList.contains("is-open")`);

async function openReader(page: Page, path = "/Genesis.1?lang=bi") {
  await page.context().route("**/lc-chatbot.umd.cjs", (r) => r.fulfill({ contentType: "text/javascript", body: STAND_IN }));
  await open(page, path, { assistantScript: true });
  await expect(page.locator('[role="group"][data-ref="Genesis 1:1"]').first()).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(() => document.querySelector("lc-chatbot")?.shadowRoot?.querySelector(".c"));
}

test.describe("the Library Assistant and the menu on a phone", () => {
  test.beforeEach(({ page }) => test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only"));

  // @feature AI-011
  test("the assistant's sheet is above the reader's top bar: every button in it takes a tap, and Close shuts it @mobile", async ({ page }) => {
    await openReader(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.locator("lc-chatbot").locator(".ask").tap();
    await expect.poll(() => isOpen(page)).toBe(true);
    const buttons = ["Log in to see chat history", "More options", "Close"].map((l) => shadow(`[aria-label="${l}"]`));
    expect(await covering(page, `[${buttons.join(",")}]`)).toEqual([null, null, null]);
    await page.locator("lc-chatbot").getByRole("button", { name: "Close" }).tap();
    await expect.poll(() => isOpen(page)).toBe(false);
    expect(await page.evaluate(() => window.scrollY)).toBe(400); // the page where it was
  });

  // @feature AI-011
  test("the assistant opened from the menu is above the reader's top bar too @mobile", async ({ page }) => {
    await openReader(page);
    await page.getByRole("button", { name: "Menu", exact: true }).first().tap();
    await page.locator("#mobile-nav").getByTestId("assistant-menu-item").tap();
    await expect(page.locator("#mobile-nav")).toBeHidden();
    await expect.poll(() => isOpen(page)).toBe(true);
    expect(await covering(page, `[${shadow('[aria-label="Close"]')}]`)).toEqual([null]);
  });

  // @feature GUI-011 @feature SHL-062
  test("on a reader page the top bar's menu button opens the menu and a second tap closes it @mobile", async ({ page }) => {
    await openReader(page);
    const nav = page.locator("#mobile-nav");
    await page.touchscreen.tap(20, 28);
    await expect(nav).toBeVisible();
    expect(await page.evaluate(() => document.elementFromPoint(20, 28)?.closest("button")?.getAttribute("aria-expanded"))).toBe("true");
    await page.touchscreen.tap(20, 28);
    await expect(nav).toBeHidden();
    expect(await page.evaluate(() => document.elementFromPoint(20, 28)?.closest("button")?.getAttribute("aria-expanded"))).toBe("false");
    // and again: it opens
    await page.touchscreen.tap(20, 28);
    await expect(nav).toBeVisible();
  });

  // @feature AI-011
  test("the Ask button is in the bottom corner and hides while the menu is open @mobile", async ({ page }) => {
    await openReader(page);
    const ask = page.locator("lc-chatbot").locator(".ask");
    const vw = page.viewportSize()!;
    const box = (await ask.boundingBox())!;
    expect({ right: Math.round(vw.width - box.x - box.width), bottom: Math.round(vw.height - box.y - box.height), w: box.width, h: box.height }).toEqual({ right: 16, bottom: 16, w: 98, h: 56 });
    expect(await covering(page, `[${shadow(".ask")}]`)).toEqual([null]);
    await page.touchscreen.tap(20, 28);
    await expect(page.locator("#mobile-nav")).toBeVisible();
    await expect(ask).toBeHidden();
  });
});
