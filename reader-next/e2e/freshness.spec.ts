import { expect, test, type Page } from "@playwright/test";
import { open, sectionRefs, setScrollTop } from "./helpers";

/**
 * Text is asked again at most an hour after it was fetched, and a return from one of Django's editors leaves
 * no stale copy of the edited book on disk.
 */

/** The text queries stored on disk (IndexedDB `sefaria-reader`), as their refs. */
const storedTextRefs = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("sefaria-reader");
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("queries")) return db.close(), resolve([]);
          const all = db.transaction("queries").objectStore("queries").getAllKeys();
          all.onsuccess = () => {
            db.close();
            resolve(
              (all.result as string[])
                .filter((k) => k.startsWith("sr-text-"))
                .map((k) => (JSON.parse(k.slice("sr-text-".length)) as unknown[])[1] as string),
            );
          };
        };
      }),
  );

const textRequests = (page: Page, ref: RegExp) => {
  const seen: string[] = [];
  page.on("request", (r) => r.url().includes("/api/v3/texts/") && ref.test(decodeURIComponent(r.url())) && seen.push(r.url()));
  return seen;
};

/**
 * Read Genesis 1–3 (Genesis 3 is kept on disk), let `elapsed` pass, come back to Genesis 1 and read on to Genesis 3 again: returns the
 * requests for Genesis 3's text made then. (Genesis 2 is no witness: the page asks the browser to preload the next section anyway.)
 */
async function readAgainAfter(page: Page, elapsed: string) {
  await page.clock.install();
  await open(page, "/Genesis.1?lang=en");
  for (const next of ["Genesis 2", "Genesis 3"]) {
    await setScrollTop(page, "bottom");
    await expect.poll(() => sectionRefs(page)).toContain(next);
  }
  await expect.poll(() => storedTextRefs(page)).toContain("Genesis 3");
  await page.clock.fastForward(elapsed);
  await open(page, "/Genesis.1?lang=en");
  const asked = textRequests(page, /Genesis[ _]3\b/);
  for (const next of ["Genesis 2", "Genesis 3"]) {
    await setScrollTop(page, "bottom");
    await expect.poll(() => sectionRefs(page)).toContain(next);
  }
  await page.waitForTimeout(500);
  return asked;
}

test("a section fetched less than an hour ago is read from the cache, with no request", async ({ page }) => {
  expect(await readAgainAfter(page, "00:50:00")).toEqual([]);
});

test("past the hour, the stored section shows at once and is asked for again behind it", async ({ page }) => {
  expect((await readAgainAfter(page, "01:01:00")).length).toBeGreaterThan(0);
});

test("back from a Django editor (?next=), nothing of the edited book is painted from disk", async ({ page, baseURL }) => {
  await open(page, "/Genesis.1?lang=en");
  await expect.poll(() => storedTextRefs(page)).toEqual(expect.arrayContaining(["Genesis 1", "Genesis 2"]));
  // an ordinary page keeps them
  await open(page, "/Exodus.1?lang=en");
  await expect.poll(() => storedTextRefs(page)).toContain("Exodus 1");
  expect(await storedTextRefs(page)).toEqual(expect.arrayContaining(["Genesis 1", "Genesis 2"]));
  // the editor sends the reader back with a full page load; its address is the page's referrer
  await page.goto("/Exodus.1?lang=en", { referer: `${baseURL}/edit/Genesis.1.1/en/The_Contemporary_Torah,_Jewish_Publication_Society,_2006` });
  await page.waitForSelector("html[data-hydrated='true']");
  await expect.poll(() => storedTextRefs(page)).not.toContain("Genesis 2");
  expect((await storedTextRefs(page)).filter((r) => r.startsWith("Genesis"))).toEqual([]);
  expect(await storedTextRefs(page)).toContain("Exodus 1");
  // and the next visit to the book asks the server again
  const asked = textRequests(page, /Genesis[ _]2\b/);
  await open(page, "/Genesis.1?lang=en");
  await setScrollTop(page, "bottom");
  await expect.poll(() => sectionRefs(page)).toContain("Genesis 2");
  expect(asked.length).toBeGreaterThan(0);
});
