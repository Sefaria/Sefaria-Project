import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * SC-30249 — Mobile web: stop preventing mobile browsers from maximizing
 * screen real estate.
 *
 * Automated coverage for the mobile-web (MW-###) cases of the SC-30249 test
 * plan. Test IDs match the test plan spreadsheet 1:1 for traceability.
 *
 * The fix makes the *document* the scroll container on singlePanel so mobile
 * browsers detect document-level scrolling and collapse their URL/nav bars.
 * The URL-bar collapse itself (MW-001, MW-002) is real browser chrome and is
 * NOT observable under Playwright device emulation — those two cases stay
 * manual. MW-003 verifies the mechanism the browsers key off (document-level
 * scroll + clean overflow on html/body), which is the strongest automatable
 * proxy.
 *
 * Not automated (manual / follow-up):
 *   MW-001, MW-002 — real browser chrome behavior (emulation can't observe it)
 *   MW-012 — hamburger drawer scroll (drawer already covered in hamburger-menu.spec.ts)
 *   MW-013 — back/forward scroll restoration
 *   MW-014 — portrait/landscape rotation
 *
 * KNOWN FAILURE (2026-07-15, validated against a local build of this branch):
 * MW-004 and MW-006 fail because infinite-scroll-down never fires in
 * window-scroll mode — adjustInfiniteScroll compares $lastText.position().top
 * (document-relative, constant while the window scrolls) against
 * getClientHeight(); the up-branch works because it uses getLocalScrollTop().
 * These tests encode the test plan's expected behavior and will pass once
 * TextColumn.jsx's down-branch measures viewport-relative.
 *
 * Runs under playwright.mobileweb.config.ts (Pixel 5 / iPhone 13, < 843px).
 */

const GENESIS_1 = `${MODULE_URLS.EN.LIBRARY}/Genesis.1`;
const GENESIS_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.5`;
const GENESIS_3_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.3.5`;

test.describe('Mobile Reader — document-level scrolling (SC-30249)', () => {
  let page: Page;
  let pm: PageManager;

  const openReader = async (context, url: string) => {
    page = await goToPageWithLang(context, url, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  };

  test('MW-003: document is the scroll container (URL-bar collapse mechanism)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().expectDocumentIsScrollContainer();
  });

  test('MW-004: infinite scroll down loads the next chapter', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowUntilSectionLoads('Genesis 2', 'down');
  });

  test('MW-005: infinite scroll up loads the previous chapter without a scroll jump', async ({ context }) => {
    await openReader(context, GENESIS_5);
    await pm.onReaderScroll().waitForSection('Genesis 5');
    await pm.onReaderScroll().scrollWindowUntilSectionLoads('Genesis 4', 'up');
    // restoreScrollPositionAfterTopLoad must keep previously-visible content in
    // place: with Genesis 4 now above us, our scroll offset must be > 0 (a
    // jump-to-top bug would leave scrollY at 0 showing Genesis 4:1).
    await expect
      .poll(() => pm.onReaderScroll().getWindowScrollY(), { timeout: t(10000) })
      .toBeGreaterThan(0);
  });

  test('MW-006: header/URL track the visible section while scrolling', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowUntilSectionLoads('Genesis 2', 'down');
    // Once Genesis 2 is at the top of the viewport the highlight-tracking loop
    // (adjustHighlightedAndVisible) must update the address-bar ref.
    await expect(page).toHaveURL(/Genesis\.2/, { timeout: t(30000) });
  });

  test('MW-007: direct segment URL scrolls to the highlighted segment on load', async ({ context }) => {
    await openReader(context, GENESIS_3_5);
    await pm.onReaderScroll().expectHighlightedSegmentInViewport('Genesis 3:5');
    // setInitialScrollPosition must have actually scrolled the document.
    expect(await pm.onReaderScroll().getWindowScrollY()).toBeGreaterThan(0);
  });

  test('MW-008: tapping a segment opens the connections overlay with highlight', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().tapSegmentToOpenConnections('Genesis 1:1');
  });

  test('MW-009: closing the connections overlay restores normal reading state', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().tapSegmentToOpenConnections('Genesis 1:1');
    await pm.onReaderScroll().closeConnectionsOverlay();
    await pm.onReaderScroll().expectConnectionsClosed();
    // Scrolling still works after the overlay round-trip.
    await pm.onReaderScroll().scrollWindowBy(600);
    await expect
      .poll(() => pm.onReaderScroll().getWindowScrollY(), { timeout: t(10000) })
      .toBeGreaterThan(0);
  });

  test('MW-010: no horizontal wobble while scrolling', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    // Shake the page vertically a few times, then confirm the horizontal axis
    // never opened up (overflow-x: clip on #s2 clips stray 100vw overflow).
    for (let i = 0; i < 3; i++) {
      await pm.onReaderScroll().scrollWindowToBottom();
      await pm.onReaderScroll().scrollWindowToTop();
    }
    await pm.onReaderScroll().expectNoHorizontalOverflow();
  });

  test('MW-011: top chrome stays pinned while the document scrolls', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowBy(1500);
    await expect
      .poll(() => pm.onReaderScroll().getWindowScrollY(), { timeout: t(10000) })
      .toBeGreaterThan(0);
    await pm.onReaderScroll().expectTopChromePinned();
  });

  test('MW-015: Hebrew text scrolls with no horizontal overflow (RTL)', async ({ context }) => {
    await openReader(context, `${GENESIS_1}?lang=he`);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowToBottom();
    await pm.onReaderScroll().scrollWindowToTop();
    await pm.onReaderScroll().expectNoHorizontalOverflow();
  });

  test('MW-016: book title block renders at the very top (no phantom loader)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowToTop();
    await pm.onReaderScroll().expectBookTitleAtTop();
  });
});
