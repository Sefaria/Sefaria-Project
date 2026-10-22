import type { Page } from "@playwright/test";

/** Navigate and wait until React has hydrated, so clicks are never swallowed by server-rendered markup. */
export async function open(page: Page, path: string, opts: { cookieNotice?: boolean } = {}) {
  // The cookie notice is a bar over the bottom left of the page: tests that are not about it have already accepted it
  if (!opts.cookieNotice) await page.context().addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
  const res = await page.goto(path);
  await page.waitForSelector("html[data-hydrated='true']");
  return res;
}

/** The element that scrolls the text: the column on desktop, the page on phones. */
const SCROLLER = `(() => { const c = document.querySelector("[data-reader-scroller]"); const o = getComputedStyle(c).overflowY; return o === "auto" || o === "scroll" ? c : document.scrollingElement; })()`;

/** Scroll the text programmatically (no reading intent: the URL does not follow). */
export const setScrollTop = (page: Page, y: number | "bottom") =>
  page.evaluate(`(() => { const s = ${SCROLLER}; s.scrollTop = ${y === "bottom" ? "s.scrollHeight" : y}; })()`);

export const scrollTop = (page: Page) => page.evaluate(`${SCROLLER}.scrollTop`) as Promise<number>;

/** Scroll like a reader: wheel events over the text (marks reading intent, so the URL follows). */
export async function wheel(page: Page, dy: number, steps = 1) {
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(400, box!.height / 2));
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, dy);
}

/** On-screen top of a segment. */
export const segmentTop = (page: Page, ref: string) =>
  page.locator(`[role="group"][data-ref="${ref}"]`).evaluate((el) => el.getBoundingClientRect().top);

export const sectionRefs = (page: Page) =>
  page.locator("[data-language] section[data-ref]").evaluateAll((els) => els.map((e) => e.getAttribute("data-ref")));

export const focused = (page: Page) => page.locator('[data-focused="true"]').getAttribute("data-ref");
