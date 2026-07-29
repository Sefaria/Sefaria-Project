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
 *   MW-014 — portrait/landscape rotation
 *   MW-022 — tablet rotation across the 843px breakpoint (real device; the
 *            emulated half of this hook is automated as DW-019)
 *   MW-023 — iOS Safari 15 `overflow-x: clip` fallback (real device / BrowserStack)
 *   MW-024 — browsers without `:has()` support (real device / BrowserStack)
 *
 * MW-017…MW-021 are regression rows from
 * e2e-tests/test-plans/sc-30249-regression.md, derived from the diff rather than
 * the feature description; the R-hooks in their comments index that plan's risk table.
 *
 * RESOLVED (2026-07-29): MW-004 and MW-006 previously failed because
 * infinite-scroll-down never fired in window-scroll mode — adjustInfiniteScroll
 * compared $lastText.position().top (scroll-invariant when the document is the
 * scroller, since .textColumn is its offsetParent and scrolls with it) against
 * getClientHeight(); the up-branch always worked because it uses
 * getLocalScrollTop(). TextColumn.adjustInfiniteScroll now measures the last
 * section's bottom viewport-relative, in the same frame as getClientHeight().
 *
 * Runs under playwright.mobileweb.config.ts (Pixel 5 / iPhone 13, < 843px).
 */

const GENESIS_1 = `${MODULE_URLS.EN.LIBRARY}/Genesis.1`;
const GENESIS_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.5`;
const GENESIS_3_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.3.5`;
// Two verses — shorter than a mobile viewport, so TextColumn's
// `getScrollHeight() <= getClientHeight()` guard early-returns (R12).
const PSALMS_117 = `${MODULE_URLS.EN.LIBRARY}/Psalms.117`;
// A segment far enough down a long chapter that setInitialScrollPosition must
// actually scroll to reach it (R11).
const GENESIS_24_40 = `${MODULE_URLS.EN.LIBRARY}/Genesis.24.40`;
const EXODUS_1 = `${MODULE_URLS.EN.LIBRARY}/Exodus.1`;

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
    // Infinite scroll attaches Genesis 2 below the fold but leaves the viewport
    // on Genesis 1:31, so put it at the top of the viewport explicitly. Once it
    // is there the highlight-tracking loop (adjustHighlightedAndVisible) must
    // update the address-bar ref.
    await pm.onReaderScroll().scrollSectionIntoView('Genesis 2');
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

  // ==========================================================================
  // Regression rows from e2e-tests/test-plans/sc-30249-regression.md.
  // Hook IDs (R3, R5, R11, R12) refer to that plan's risk table.
  // ==========================================================================

  test('MW-017: a text shorter than the viewport renders without scroll errors (R12)', async ({ context }) => {
    const pageErrors: Error[] = [];
    await openReader(context, PSALMS_117);
    page.on('pageerror', (err) => pageErrors.push(err));
    await pm.onReaderScroll().waitForSection('Psalms 117');

    // Measured on the branch (Pixel 5, innerHeight 727): even a two-verse text
    // produces a .textColumn taller than the viewport once the book-title block
    // and reader chrome are counted, so TextColumn's early-return guard
    // (offsetHeight <= innerHeight, TextColumn.jsx:296) does not actually trigger
    // for real mobile texts. Asserting on that guard would be asserting on an
    // unreachable branch, so this row asserts the user-visible contract instead:
    // the shortest text in the library still renders coherently and quietly.
    const metrics = await pm.onReaderScroll().getDocumentScrollMetrics();
    expect(
      metrics.columnOffsetHeight,
      'the text column has no height at all — the short-text path is broken'
    ).toBeGreaterThan(0);
    await expect(page).toHaveURL(/Psalms\.117/, { timeout: t(30000) });
    await pm.onReaderScroll().expectNoHorizontalOverflow();
    expect(pageErrors, `JS errors on a short text: ${pageErrors.map(e => e.message).join('; ')}`).toHaveLength(0);
  });

  test('MW-018: the connections overlay is pinned to the bottom of the viewport (R5)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().tapSegmentToOpenConnections('Genesis 1:1');
    // .textList went from in-flow inside a fixed shell to position:fixed / 54vh /
    // bottom:0. It must sit flush with the viewport bottom and stay there.
    await pm.onReaderScroll().expectConnectionsOverlayPinnedToBottom();
  });

  test('MW-019: fixed header and sticky controls stack without covering the text (R3, R4)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowToTop();
    await pm.onReaderScroll().expectTopChromeDoesNotOverlap();
    await pm.onReaderScroll().expectFirstSegmentBelowTopChrome();
  });

  test('MW-020: a content-language change keeps the reading position (R11)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowBy(1200);

    const before = await pm.onReaderScroll().getVisibleSegmentRefs();
    await pm.onReaderScroll().setSourceTranslationMode('Source with Translation');
    await pm.onReaderScroll().expectReadingPositionPreserved(before);
  });

  test('MW-021: a deep-linked segment lands below the fixed chrome, not under it (R11)', async ({ context }) => {
    await openReader(context, GENESIS_24_40);
    // MW-007 already proves the segment is *somewhere* in the viewport. This row
    // is stricter, because setInitialScrollPosition measures its target with
    // $highlighted.position().top — relative to #panelWrapBox, which the new CSS
    // makes the offsetParent — while setScrollTop adds the .textColumn's own
    // document offset. If those two frames disagree the segment lands under the
    // pinned header.
    await pm.onReaderScroll().expectHighlightedSegmentInViewport('Genesis 24:40');
    await pm.onReaderScroll().expectSegmentBelowTopChrome('Genesis 24:40');
  });

  // ==========================================================================
  // Rows adopted from the story's original test plan.
  // ==========================================================================

  // MW-012 (nav drawer scroll-lock) is NOT here: probing a live mobile build
  // showed the reader renders no `.headerInner` and no hamburger button at all —
  // only `.readerControlsOuter`. The drawer is reachable from nav surfaces, so the
  // row lives in mobile-surfaces-scroll.spec.ts where it can actually run.

  test('MW-013: browser Back restores the reading position on mobile', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowBy(1500);
    await expect
      .poll(() => pm.onReaderScroll().getWindowScrollY(), { timeout: t(10000) })
      .toBeGreaterThan(0);
    const before = await pm.onReaderScroll().getVisibleSegmentRefs();

    await page.goto(EXODUS_1);
    await hideAllModalsAndPopups(page);
    await pm.onReaderScroll().waitForSection('Exodus 1');

    await page.goBack();
    await pm.onReaderScroll().waitForSection('Genesis 1');
    // On mobile the saved position is a window scroll offset, not a column
    // scrollTop — the substitution this diff made. This is its history round-trip.
    await pm.onReaderScroll().expectReadingPositionPreserved(before);
  });
});
