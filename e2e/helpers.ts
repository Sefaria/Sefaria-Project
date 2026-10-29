import type { Page } from "@playwright/test";

const hydrationErrors = new WeakMap<Page, string[]>();

/**
 * Navigate and wait until React has hydrated, so clicks are never swallowed by server-rendered markup. A hydration mismatch (the
 * server and the browser rendering different text: a Node-only value, an ICU difference) fails the test: React silently re-renders
 * the client's version, so the page "works" while the server render was wrong.
 */
export async function open(page: Page, path: string, opts: { cookieNotice?: boolean } = {}) {
  // The cookie notice is a bar over the bottom left of the page: tests that are not about it have already accepted it
  if (!opts.cookieNotice) await page.context().addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
  if (!hydrationErrors.has(page)) {
    const seen: string[] = [];
    hydrationErrors.set(page, seen);
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat/i.test(m.text())) seen.push(m.text().slice(0, 600));
    });
  }
  const res = await page.goto(path);
  await page.waitForSelector("html[data-hydrated='true']");
  // React reports a recoverable hydration error after the commit: give it two frames to arrive before looking
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const seen = hydrationErrors.get(page)!;
  if (seen.length) throw new Error(`hydration mismatch on ${path}:\n${seen.join("\n---\n")}`);
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
