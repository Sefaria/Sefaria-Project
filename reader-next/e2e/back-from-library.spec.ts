import { expect, test, type Page } from "@playwright/test";
import { open, segmentTop } from "./helpers";

/** "/Genesis.2.2?lang=bi" → "Genesis 2:2" */
const refOfPath = (url: string) => {
  const parts = new URL(url).pathname.slice(1).split(".");
  return `${parts[0]!.replace(/_/g, " ")} ${parts.slice(1).join(":")}`;
};

/** The verse the reading engine holds as current (development builds expose its state). */
const focusVerse = (page: Page) => page.evaluate(() => (window as unknown as { __readingScroll?: { focus?: string } }).__readingScroll?.focus ?? "");

/** Read a little, leave the reader for a library page by an in-app link, come Back: the verse is where it was. */
async function leaveAndComeBack(page: Page) {
  await open(page, "/Genesis.1.20?lang=bi");
  await page.waitForTimeout(800);
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
  }
  // Losing the place would put the address's verse on the reading line (140px under the column's top, +2): nudge on until the current
  // verse is clear of it, so a lost place shows.
  const line = box!.y + 142;
  let ref = await focusVerse(page);
  let before = await segmentTop(page, ref);
  for (let i = 0; i < 6 && Math.abs(before - line) <= 20; i++) {
    await page.mouse.wheel(0, 50);
    await page.waitForTimeout(500);
    ref = await focusVerse(page);
    before = await segmentTop(page, ref);
  }
  expect(Math.abs(before - line)).toBeGreaterThan(20);
  await expect.poll(() => refOfPath(page.url())).toBe(ref);
  await page.locator('a[href="/texts"]:visible').first().click();
  await expect(page).toHaveURL(/\/texts$/);
  await expect(page.locator("[data-reader-scroller]")).toHaveCount(0); // the reader has left the page (a quick Back could beat it)
  await page.goBack();
  await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(800);
  return { ref, before, after: await segmentTop(page, ref) };
}

// The reader's page is unmounted while a library page shows, so the arrival by Back has to be known without it. sefaria.org
// (measured 2026-11-12, Genesis 1:20 bilingual, 1280px, six wheel steps, Texts, Back) does not keep the place either: Genesis 2:1
// came back 164px lower than it was. Here the place is restored exactly (back/forward restore, as within the reader); before this
// fix the address's verse was put on the reading line instead, 98px off.
// @feature SHL-064 @feature SHL-065
test("Back from a library page puts the reader where they were", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
  const { ref, before, after } = await leaveAndComeBack(page);
  expect(Math.abs(after - before), `${ref}: ${before} before, ${after} after`).toBeLessThan(2);
});

// The same on a phone, where the page itself scrolls, in each language mode, reading to a chapter's last verses in the same page. In
// Hebrew the labels settle again as the reader comes back; that settling once "put back" a verse measured while the menu's site header
// was still above the text, 60px off.
// @feature SHL-064 @feature SHL-065
for (const lang of ["bi", "he", "en"] as const) {
  test(`Back from a library page puts the reader where they were, on a phone, ${lang} @mobile`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
    await open(page, `/Genesis.1.20?lang=${lang}`);
    await page.waitForTimeout(800);
    await page.mouse.move(200, 400);
    await readToLastVerses(page, /\/Genesis\.1\.3[01]\?/);
    const ref = refOfPath(page.url());
    // on a phone the library link is in the menu; opening it shows the site header above the panel (the text moves down 60px), but the
    // place kept is the one the reader was reading
    const before = await segmentTop(page, ref);
    await page.getByRole("button", { name: "Menu" }).first().click();
    await page.waitForTimeout(300);
    await page.locator('a[href="/texts"]:visible').first().click();
    await expect(page).toHaveURL(/\/texts$/);
    await expect(page.locator("[data-reader-scroller]")).toHaveCount(0); // the reader has left the page (a quick Back could beat it)
    await page.goBack();
    await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1200);
    const after = await segmentTop(page, ref);
    expect(Math.abs(after - before), `${ref}: ${before} before, ${after} after`).toBeLessThan(2);
  });
}

// Hebrew on a phone with slow answers (as from the live site): the column's labels settle again as the reader comes back from the menu,
// while the place is put back. Corrected for the verse on the focus line as if the reader had moved, that settling measured the verse
// with the menu's site header still above the text and moved the reader 60px.
// @feature SHL-064 @feature SHL-065
test("Back from the menu with slow answers, Hebrew on a phone: every frame where it was @mobile", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
  await open(page, "/Genesis.1.20?lang=he");
  await page.waitForTimeout(800);
  await page.mouse.move(200, 400);
  await readToLastVerses(page, /\/Genesis\.1\.3[01]\?/);
  const ref = refOfPath(page.url());
  const before = await segmentTop(page, ref);
  await page.getByRole("button", { name: "Menu" }).first().click();
  await page.waitForTimeout(300);
  await page.locator('a[href="/texts"]:visible').first().click();
  await expect(page).toHaveURL(/\/texts$/);
  await expect(page.locator("[data-reader-scroller]")).toHaveCount(0);
  const slow = (r: import("@playwright/test").Route) => void setTimeout(() => void r.continue().catch(() => {}), 400);
  await page.route("**/api/v3/texts/**", slow);
  await page.route("**/api/texts/versions/**", slow);
  await traceVerseHere(page, ref);
  await page.goBack();
  await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(2500);
  await drawnOnlyAt(page, ref, before, "library, slow answers");
  expect(Math.abs((await segmentTop(page, ref)) - before), "final").toBeLessThan(2);
});

// Desktop, in the app, with a library page that is slow to load: the reader stays on screen while it loads, and Back can come before it
// shows. The address of a page outside the reader was taken for a new entry of the panel's, which put the address's verse on the reading
// line (78px) as the reader left, and showed that on the frame before Back put the place back. Every painted frame, from the click on.
// @feature SHL-064 @feature SHL-065
for (const wait of [300, 2500] as const) {
  test(`Back from a slow library page (Back after ${wait}ms): the verse is drawn only where it was`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
    const { ref, before } = await readOn(page);
    // the library home's data arrives late, so the page stays on the reader while it loads
    await page.route("**/api/calendars**", (r) => void setTimeout(() => void r.continue().catch(() => {}), 1500));
    await traceVerseHere(page, ref);
    await page.locator('a[href="/texts"]:visible').first().click();
    await page.waitForTimeout(wait);
    await page.goBack();
    await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    await drawnOnlyAt(page, ref, before, `Back after ${wait}ms`);
    expect(Math.abs((await segmentTop(page, ref)) - before), "final").toBeLessThan(2);
  });
}

/**
 * Where a verse is drawn on every frame from the document's start (installed before a Back that loads a new document). Read after
 * each frame's callbacks (a task queued from the frame), so it is what was painted: read inside the frame, it can run before the
 * page's own placing in that frame and see a position that is never shown.
 */
const traceVerse = (page: Page, ref: string) =>
  page.addInitScript((r) => {
    const out: number[] = ((window as unknown as { __verseTops: number[] }).__verseTops = []);
    const f = () => {
      const e = document.querySelector(`[role="group"][data-ref="${r}"]`);
      // drawn: the column is not held invisible while the fonts arrive
      if (e && getComputedStyle(e).visibility !== "hidden") out.push(e.getBoundingClientRect().top);
      if (out.length < 240) requestAnimationFrame(() => setTimeout(f));
    };
    requestAnimationFrame(() => setTimeout(f));
  }, ref);

/** Read on until the address names the chapter's last verse (the next chapter loaded below), so little of what is read stays loaded. */
async function readToLastVerses(page: Page, last: RegExp) {
  for (let i = 0; i < 60 && !last.test(page.url()); i++) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(250);
  }
  await expect(page).toHaveURL(last);
  await page.waitForTimeout(1200); // the address has settled
}

/** Read a little way into Genesis 1-2 (bilingual, desktop); the verse being read and where it is. */
async function readOn(page: Page) {
  await open(page, "/Genesis.1.20?lang=bi");
  await page.waitForTimeout(800);
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1200);
  const ref = await focusVerse(page);
  await expect.poll(() => refOfPath(page.url())).toBe(ref);
  return { ref, before: await segmentTop(page, ref) };
}

// Leaving by a full page load (a link to a page served by the server, as Django's pages are), Back is a new document of the reader. The
// place kept on pagehide is put back before the first paint (the inline script) and held by the app: the verse never shows elsewhere.
// @feature SHL-064 @feature SHL-065
test("Back to the reader after a full page load puts the reader where they were, with no jump", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
  const { ref, before } = await readOn(page);
  await traceVerse(page, ref);
  await page.evaluate(() => location.assign("/Genesis"));
  await expect(page).toHaveURL(/\/Genesis$/);
  await page.goBack();
  await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1000);
  const after = await segmentTop(page, ref);
  expect(Math.abs(after - before), `${ref}: ${before} before, ${after} after`).toBeLessThan(2);
  const tops = await page.evaluate(() => (window as unknown as { __verseTops: number[] }).__verseTops);
  expect(tops.length).toBeGreaterThan(0);
  expect(Math.max(...tops.map((t) => Math.abs(t - before))), `drawn at ${[...new Set(tops.map(Math.round))].join(", ")}`).toBeLessThan(2);
});

// The same after a full page load: the new document's first paint must already have the room under the text that the kept place
// needs (the next chapter is not loaded yet); without it the verse was drawn low for the first frames, then moved (English 211px,
// bilingual 58px, two panels 42px).
// @feature SHL-064 @feature SHL-065
for (const [name, start] of [
  ["bilingual", "/Genesis.1.20?lang=bi"],
  ["English", "/Genesis.1.20?lang=en"],
  ["two panels", "/Genesis.1.20?lang=bi&p2=Exodus.1&lang2=bi"],
] as const) {
  test(`Back after a full page load at a chapter's last verses, ${name}: the verse is drawn only where it was`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
    await open(page, start);
    await page.waitForTimeout(800);
    const box = await page.locator("[data-reader-scroller]").first().boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
    await readToLastVerses(page, /\/Genesis\.1\.31\?/);
    const ref = "Genesis 1:31";
    const before = await segmentTop(page, ref);
    await traceVerse(page, ref);
    await page.evaluate(() => location.assign("/Genesis"));
    await expect(page).toHaveURL(/\/Genesis$/);
    await page.goBack();
    await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    const tops = await page.evaluate(() => (window as unknown as { __verseTops: number[] }).__verseTops);
    expect(tops.length).toBeGreaterThan(10);
    expect(Math.max(...tops.map((t) => Math.abs(t - before))), `${ref} at ${before}, drawn at ${[...new Set(tops.map(Math.round))].join(", ")}`).toBeLessThan(2);
    // and the reader can read on: the next chapter arrives below and the room goes
    await expect(page.locator('section[data-ref="Genesis 2"]').first()).toBeAttached({ timeout: 25_000 });
  });
}

// At a chapter's last verses the next chapter had loaded below; on the way back it has not yet, so the column could not scroll that far
// and the verse came back lower (Genesis 1:31: 506 before, 564 after). Room is kept under the text until the next chapter is in.
// @feature SHL-064 @feature SHL-065
test("Back to a reader at a chapter's last verses puts the reader where they were", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 600, "desktop project only");
  await open(page, "/Genesis.1.20?lang=bi");
  await page.waitForTimeout(800);
  const box = await page.locator("[data-reader-scroller]").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 300);
  await readToLastVerses(page, /\/Genesis\.1\.31\?/);
  const ref = await focusVerse(page);
  const before = await segmentTop(page, ref);
  await page.locator('a[href="/texts"]:visible').first().click();
  await expect(page).toHaveURL(/\/texts$/);
  await expect(page.locator("[data-reader-scroller]")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
  await page.waitForTimeout(1000);
  const after = await segmentTop(page, ref);
  expect(Math.abs(after - before), `${ref}: ${before} before, ${after} after`).toBeLessThan(2);
  // and the reader can read on: the next chapter is there below
  await expect(page.locator('section[data-ref="Genesis 2"]')).toBeAttached({ timeout: 25_000 });
});

/** Where a verse is drawn on every frame from now on, in this document (a Back within the app). */
const traceVerseHere = (page: Page, ref: string) =>
  page.evaluate((r) => {
    const out: number[] = ((window as unknown as { __verseTops: number[] }).__verseTops = []);
    const f = () => {
      const e = document.querySelector(`[role="group"][data-ref="${r}"]`);
      if (e && getComputedStyle(e).visibility !== "hidden") out.push(e.getBoundingClientRect().top);
      if (out.length < 240) requestAnimationFrame(() => setTimeout(f));
    };
    requestAnimationFrame(() => setTimeout(f));
  }, ref);

const drawnOnlyAt = async (page: Page, ref: string, before: number, what: string) => {
  const tops = await page.evaluate(() => (window as unknown as { __verseTops: number[] }).__verseTops);
  expect(tops.length, what).toBeGreaterThan(10);
  expect(Math.max(...tops.map((t) => Math.abs(t - before))), `${what}: ${ref} at ${before}, drawn at ${[...new Set(tops.map(Math.round))].join(", ")}`).toBeLessThan(2);
};

// The same on a phone, where the page itself scrolls, in each language mode: Back after a full page load, then from the library through
// the menu, at a chapter's last verses (English and Hebrew came back 12-60px low, after about 10 frames in the right place).
// @feature SHL-064 @feature SHL-065
for (const lang of ["en", "he", "bi"] as const) {
  test(`Back after a full page load and from the menu, at a chapter's last verses, on a phone, ${lang} @mobile`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
    await open(page, `/Genesis.1.20?lang=${lang}`);
    await page.waitForTimeout(800);
    await page.mouse.move(200, 400);
    await readToLastVerses(page, /\/Genesis\.1\.3[01]\?/);
    let ref = refOfPath(page.url());
    let before = await segmentTop(page, ref);
    await traceVerse(page, ref);
    // a full page load of the search page (leaving for it, the room under the text was trimmed bit by bit on the way back, and English
    // and Hebrew came back 12-29px low after about 10 frames)
    await page.evaluate(() => location.assign("/search?q=light"));
    await expect(page).toHaveURL(/\/search\?q=light/);
    await page.waitForTimeout(1000);
    await page.goBack();
    await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    await drawnOnlyAt(page, ref, before, "full page load");
    expect(Math.abs((await segmentTop(page, ref)) - before), "full page load, final").toBeLessThan(2);
    // now from the library, through the menu (which shows the site header and moves the text down 60px before the reader leaves)
    ref = refOfPath(page.url());
    before = await segmentTop(page, ref);
    await page.getByRole("button", { name: "Menu" }).first().click();
    await page.waitForTimeout(300);
    await page.locator('a[href="/texts"]:visible').first().click();
    await expect(page).toHaveURL(/\/texts$/);
    await expect(page.locator("[data-reader-scroller]")).toHaveCount(0);
    await traceVerseHere(page, ref);
    await page.goBack();
    await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    await drawnOnlyAt(page, ref, before, "library");
    expect(Math.abs((await segmentTop(page, ref)) - before), "library, final").toBeLessThan(2);
  });
}

// The menu's site header above the text (60px) while the reading engine runs a frame: anything does that on a phone (the browser's bar
// showing or hiding resizes the window, a section or font arriving), and on CI's slower machines it came while the menu was open. The
// engine then took the verse's place with the header above it for the reader's, kept it for history, and Back drew the verse 60px low on
// every frame (Genesis 1:30, Hebrew: 266 before, 326 after). The place is kept with where the column began in the page, so it is the same
// line of the text with or without the header.
// @feature SHL-064 @feature SHL-065
for (const lang of ["he", "en"] as const) {
  test(`Back from the menu after the window resized while it was open, on a phone, ${lang} @mobile`, async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) > 600, "phone project only");
    await open(page, `/Genesis.1.20?lang=${lang}`);
    await page.waitForTimeout(800);
    await page.mouse.move(200, 400);
    await readToLastVerses(page, /\/Genesis\.1\.3[01]\?/);
    const ref = refOfPath(page.url());
    const before = await segmentTop(page, ref);
    await page.getByRole("button", { name: "Menu" }).first().click();
    await expect.poll(() => segmentTop(page, ref)).toBeGreaterThan(before + 30); // the site header is above the text
    // the browser's bar hides and shows again (the window is 50px taller, then as it was)
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: size.height + 50 });
    await page.waitForTimeout(200);
    await page.setViewportSize(size);
    await page.waitForTimeout(300);
    await page.locator('a[href="/texts"]:visible').first().click();
    await expect(page).toHaveURL(/\/texts$/);
    await expect(page.locator("[data-reader-scroller]")).toHaveCount(0);
    await traceVerseHere(page, ref);
    await page.goBack();
    await expect(page.locator(`[role="group"][data-ref="${ref}"]`)).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(1500);
    await drawnOnlyAt(page, ref, before, "menu, window resized");
    expect(Math.abs((await segmentTop(page, ref)) - before), "final").toBeLessThan(2);
  });
}
