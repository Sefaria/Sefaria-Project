import { BrowserContext, Page } from '@playwright/test';

/**
 * Records every version of the search page's "no results" box that ever exists
 * on screen, from the very first moment it appears — for LA-NULL-3 ("neither
 * version flashes first").
 *
 * Why it's built this way: a wrong version that shows for one frame and is
 * then replaced would be gone before any normal Playwright check could look at
 * it. So a small script is put into the page before it loads. It uses a
 * MutationObserver (a browser feature that calls us back every time the page's
 * content changes, before the browser paints that change), and each time it
 * writes down two things about the "no results" box: is the Browse button
 * there, and what does the body text say.
 *
 * Class names are used here (not roles or text) on purpose: this is not finding
 * something to click, it's watching the raw page for a state that may exist for
 * only a moment. The classes come from static/js/NoSearchResults.jsx.
 *
 * Call installNullStateRecorder BEFORE the first navigation (before goToPageWithUser).
 */

export interface NullStateRecord {
  /** Which tab's box it was: the image name tells us (NoResultsSource.svg → "Source"). */
  image: string;
  hasBrowseButton: boolean;
  /** Body text with non-breaking spaces turned into normal spaces and runs of spaces collapsed. */
  body: string;
}

export async function installNullStateRecorder(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as any;
    if (w.__nullStateRecords) return;
    const records: any[] = [];
    w.__nullStateRecords = records;
    let last = '';
    const record = () => {
      document.querySelectorAll('.noSearchResults').forEach((box) => {
        const img = box.querySelector('img.noSearchResults-image') as HTMLImageElement | null;
        const entry = {
          image: (img?.getAttribute('src') || '').replace(/^.*NoResults|\.svg.*$/g, ''),
          hasBrowseButton: !!box.querySelector('.noSearchResults-cta'),
          body: (box.querySelector('.noSearchResults-body')?.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(),
        };
        // Only keep changes, so the list stays short.
        const key = JSON.stringify(entry);
        if (key !== last) { records.push(entry); last = key; }
      });
    };
    const start = () => {
      new MutationObserver(record).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      record();
    };
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start);
  });
}

export async function readNullStateRecords(page: Page): Promise<NullStateRecord[]> {
  return page.evaluate(() => (window as any).__nullStateRecords ?? []);
}
