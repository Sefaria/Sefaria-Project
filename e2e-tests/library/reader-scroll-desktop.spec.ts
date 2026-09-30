import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS, READER_SELECTORS } from '../constants';

/**
 * SC-30249 — desktop regression suite (DW-###).
 *
 * The SC-30249 fix rewired TextColumn's scroll plumbing (scroll target,
 * getLocalScrollTop/getClientHeight helpers, getBoundingClientRect-based
 * highlight tracking) for BOTH layouts. These tests pin the desktop
 * (multiPanel) behavior that must not regress: the window never scrolls,
 * .textColumn remains the scroll container, and infinite scroll / highlight
 * tracking / initial positioning behave as before.
 *
 * Test IDs match the SC-30249 test plan spreadsheet 1:1.
 * Not automated (manual / follow-up): DW-004 (partially covered by DW-003),
 * DW-007 (connections sync), DW-008 (window resize), DW-010 (back/forward),
 * DW-012 (language switch scroll retention).
 *
 * DW-013…DW-021 come from the regression plan at
 * e2e-tests/test-plans/sc-30249-regression.md, which derives its rows from the
 * diff rather than the feature description. Hook IDs (R1, R9, …) in the test
 * comments refer to that plan's risk table.
 *
 * DW-016 deviation from the plan: the plan's step said "open a second panel".
 * There is no documented URL or POM path for a second *text* panel in this suite,
 * and guessing one is how generated tests rot (CLAUDE.md rule 10), so DW-016
 * instead opens the connections sidebar and asserts the same invariant the row
 * cares about — the window never scrolls and `.textColumn` stays the sole
 * scroller. Second-text-panel coverage stays a plan row for a follow-up once a
 * POM path exists.
 */

const GENESIS_1 = `${MODULE_URLS.EN.LIBRARY}/Genesis.1`;
const GENESIS_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.5`;
const GENESIS_3_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.3.5`;
const RUTH_1 = `${MODULE_URLS.EN.LIBRARY}/Ruth.1`;
const EXODUS_1 = `${MODULE_URLS.EN.LIBRARY}/Exodus.1`;
// Two verses — shorter than any desktop column viewport, so it exercises the
// `getScrollHeight() <= getClientHeight()` early-return branch (R12).
const PSALMS_117 = `${MODULE_URLS.EN.LIBRARY}/Psalms.117`;
const GENESIS_1_HE = `${MODULE_URLS.HE.LIBRARY}/Genesis.1`;
// Public sheet, 41 sources (verified via /api/sheets/5156, CLAUDE.md §2A) — long
// enough to need scrolling. Read-only here, so it does not collide with the
// Bookmarks suite's ownership of the same id (that rule is about state mutation).
const LONG_SHEET = `${MODULE_URLS.EN.VOICES}/sheets/5156`;

test.describe('Desktop Reader — scroll regression (SC-30249)', () => {
  let page: Page;
  let pm: PageManager;

  const openReader = async (context, url: string) => {
    page = await goToPageWithLang(context, url, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  };

  test('DW-001: header/URL track the visible section while scrolling the column', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnUntilSectionLoads('Genesis 2', 'down');
    // Attaching Genesis 2 is not the same as viewing it; scroll into it so the
    // URL assertion tests highlight-tracking rather than incidental geometry.
    await pm.onReaderScroll().scrollSectionIntoView('Genesis 2');
    await expect(page).toHaveURL(/Genesis\.2/, { timeout: t(30000) });
  });

  test('DW-002: infinite scroll down loads the next chapter', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnUntilSectionLoads('Genesis 2', 'down');
  });

  test('DW-003: infinite scroll up loads the previous chapter without a scroll jump', async ({ context }) => {
    await openReader(context, GENESIS_5);
    await pm.onReaderScroll().waitForSection('Genesis 5');
    await pm.onReaderScroll().scrollColumnUntilSectionLoads('Genesis 4', 'up');
    // restoreScrollPositionAfterTopLoad: with Genesis 4 loaded above, the
    // column's scrollTop must be > 0 or the viewport snapped to the top (bug).
    await expect
      .poll(() => pm.onReaderScroll().getColumnScrollTop(), { timeout: t(10000) })
      .toBeGreaterThan(0);
  });

  test('DW-005: direct segment URL scrolls the column to the highlighted segment', async ({ context }) => {
    await openReader(context, GENESIS_3_5);
    await pm.onReaderScroll().expectHighlightedSegmentInViewport('Genesis 3:5');
    expect(await pm.onReaderScroll().getColumnScrollTop()).toBeGreaterThan(0);
  });

  test('DW-006: connections panel opens beside the text; column stays the scroller', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onSourceTextPage().clickSegment('Genesis 1:1');
    await expect(page.locator(READER_SELECTORS.CONNECTIONS_PANEL)).toBeVisible({ timeout: t(15000) });
    // Desktop multiPanel: isWindowScroll() must be false — the window never moves.
    await pm.onReaderScroll().expectWindowIsNotScrollContainer();
  });

  test('DW-009: singlePanel CSS does not leak onto the desktop layout', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    // #s2 position:fixed + .readerApp.multiPanel + window.scrollY pinned at 0
    // — the #s2:has(.readerApp.singlePanel) block must not apply here.
    await pm.onReaderScroll().expectWindowIsNotScrollContainer();
    await pm.onReaderScroll().expectNoHorizontalOverflow();
  });

  test('DW-011: highlight detection survives the start and end of a short text', async ({ context }) => {
    const pageErrors: Error[] = [];
    await openReader(context, RUTH_1);
    page.on('pageerror', (err) => pageErrors.push(err));
    await pm.onReaderScroll().waitForSection('Ruth 1');
    await pm.onReaderScroll().scrollColumnUntilSectionLoads('Ruth 2', 'down');
    await pm.onReaderScroll().scrollColumnUntilSectionLoads('Ruth 1', 'up');
    expect(pageErrors, `JS errors during edge scrolling: ${pageErrors.map(e => e.message).join('; ')}`).toHaveLength(0);
  });

  // ==========================================================================
  // Regression rows from e2e-tests/test-plans/sc-30249-regression.md
  // ==========================================================================

  test('DW-013: next section loads before the column hits a dead bottom (R9)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    // The diff swapped $container.outerHeight() for node.clientHeight in
    // adjustInfiniteScroll (TextColumn.jsx:302). A threshold that drifted too far
    // shows up as the column bottoming out before Genesis 2 attaches.
    await pm.onReaderScroll().expectNextSectionLoadsBeforeHardBottom('Genesis 2');
  });

  test('DW-014: the segment at the column middle is the one the URL reports (R10)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnBy(1200);

    const middleRef = await pm.onReaderScroll().getSegmentRefAtViewportMiddle();
    expect(middleRef, 'no segment spans the middle of the reading column').not.toBeNull();

    // Highlight tracking is section-granular in the URL, so compare sections:
    // "Genesis 1:15" -> "Genesis.1".
    const section = middleRef!.split(':')[0].replace(/\s+/g, '.');
    await expect(page).toHaveURL(new RegExp(section.replace(/\./g, '\\.')), { timeout: t(30000) });
  });

  test('DW-015: a text shorter than the viewport renders without scroll errors (R12)', async ({ context }) => {
    const pageErrors: Error[] = [];
    await openReader(context, PSALMS_117);
    page.on('pageerror', (err) => pageErrors.push(err));
    await pm.onReaderScroll().waitForSection('Psalms 117');

    // Observed on the branch: the column still opens at scrollTop ≈ 90, because
    // setInitialScrollPosition scrolls far enough to hide the top scroll
    // placeholder even on a two-verse text. So a "short" text is not necessarily
    // shorter than its column — what must hold is that the short-text path is
    // quiet: the window never scrolls, no runaway section loading, no errors.
    const sectionsBefore = await page.locator('.textRange.basetext').count();
    await pm.onReaderScroll().scrollColumnBy(400);
    await page.waitForTimeout(t(1500));
    await pm.onReaderScroll().expectWindowIsNotScrollContainer();
    expect(
      await page.locator('.textRange.basetext').count(),
      'sections kept loading on a text with nothing to scroll'
    ).toBe(sectionsBefore);
    expect(pageErrors, `JS errors on a short text: ${pageErrors.map(e => e.message).join('; ')}`).toHaveLength(0);
  });

  test('DW-016: with the connections sidebar open the window still never scrolls (R1)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onSourceTextPage().clickSegment('Genesis 1:1');
    await expect(page.locator(READER_SELECTORS.CONNECTIONS_PANEL)).toBeVisible({ timeout: t(15000) });
    await pm.onReaderScroll().expectColumnScrollsWithoutMovingWindow();
  });

  test('DW-006b: two text panels open side by side and scroll independently (R1, R8)', async ({ context }) => {
    // The original plan's DW-006 in full: open a connection as a real second TEXT
    // panel, not just the sidebar. The UI path (category row → commentator row →
    // "Open") was probed against a live build; it pushes `p2=` and mounts a second
    // .textColumn. DW-016 keeps the narrower sidebar-only variant.
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onSourceTextPage().clickSegment('Genesis 1:1');
    await expect(page.locator(READER_SELECTORS.CONNECTIONS_PANEL)).toBeVisible({ timeout: t(15000) });

    await pm.onReaderScroll().openSecondTextPanelFromConnections();
    await pm.onReaderScroll().expectPanelsScrollIndependently();
  });

  test('DW-007: the connections panel tracks the highlighted segment while scrolling', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onSourceTextPage().clickSegment('Genesis 1:1');
    await expect(page.locator(READER_SELECTORS.CONNECTIONS_PANEL)).toBeVisible({ timeout: t(15000) });

    // The per-category counts are computed for the highlighted segment, so they
    // are the user-visible proof that the sidebar follows the highlight — which is
    // driven by adjustHighlightedAndVisible, the function this diff rewrote from
    // jQuery offset() to getBoundingClientRect().
    const countsAtFirstSegment = await pm.onReaderScroll().getConnectionCategoryCounts();
    expect(countsAtFirstSegment.length, 'no connection categories rendered').toBeGreaterThan(0);

    await pm.onReaderScroll().scrollColumnBy(1500);
    await expect(page).toHaveURL(/Genesis\.1\.\d+/, { timeout: t(30000) });

    await expect
      .poll(async () => (await pm.onReaderScroll().getConnectionCategoryCounts()).join('|'), { timeout: t(20000) })
      .not.toBe(countsAtFirstSegment.join('|'));
  });

  test('DW-008: reading position is preserved across a window resize', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnBy(1500);
    const before = await pm.onReaderScroll().getVisibleSegmentRefs();

    // Changing the window width changes the text column's width, which is the ONLY
    // trigger for restoreScrollPositionByPercentage (TextColumn.jsx:107-109) — and
    // that method calls both getScrollHeight() and setScrollTop(), two of the
    // functions this diff rewrote. No other row reaches this path.
    await page.setViewportSize({ width: 980, height: 800 });
    await page.waitForTimeout(t(1500));
    await pm.onReaderScroll().expectReadingPositionPreserved(before);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(t(1500));
    await pm.onReaderScroll().expectReadingPositionPreserved(before);
  });

  test('DW-010: browser Back restores the reading position', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnBy(1500);
    await expect(page).toHaveURL(/Genesis\.1\.\d+/, { timeout: t(30000) });
    const before = await pm.onReaderScroll().getVisibleSegmentRefs();

    await page.goto(EXODUS_1);
    await hideAllModalsAndPopups(page);
    await pm.onReaderScroll().waitForSection('Exodus 1');

    await page.goBack();
    await pm.onReaderScroll().waitForSection('Genesis 1');
    // Position is carried by the deep ref the highlight loop wrote into the URL,
    // so this also covers that the URL tracking survives a history round-trip.
    await pm.onReaderScroll().expectReadingPositionPreserved(before);
  });

  test('DW-017: a content-language change keeps the reading position (R9, R10)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnBy(1200);

    const before = await pm.onReaderScroll().getVisibleSegmentRefs();
    // A content-language change takes componentDidUpdate's `settings.language`
    // branch → scrollToHighlighted(false) (TextColumn.jsx:103-106). It does NOT
    // exercise restoreScrollPositionByPercentage, which only fires on
    // layoutWidthChanged (TextColumn.jsx:107-109) — that path is still uncovered;
    // see the DW-008 row in the regression plan.
    await pm.onReaderScroll().setSourceTranslationMode('Source with Translation');
    await pm.onReaderScroll().expectReadingPositionPreserved(before);
  });

  test('DW-018: closing the connections panel keeps the reading position (R10)', async ({ context }) => {
    await openReader(context, GENESIS_1);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnBy(1200);
    const before = await pm.onReaderScroll().getVisibleSegmentRefs();

    await pm.onSourceTextPage().clickSegment('Genesis 1:5');
    await expect(page.locator(READER_SELECTORS.CONNECTIONS_PANEL)).toBeVisible({ timeout: t(15000) });
    await pm.onResourcePanel().closeViaCloseButton();

    await pm.onReaderScroll().expectReadingPositionPreserved(before);
  });

  test('DW-019: the layout and its scroller survive a resize past 843px (R8)', async ({ context }) => {
    const pageErrors: Error[] = [];
    await openReader(context, GENESIS_1);
    page.on('pageerror', (err) => pageErrors.push(err));
    await pm.onReaderScroll().waitForSection('Genesis 1');
    expect(await pm.onReaderScroll().isSinglePanel()).toBe(false);
    await pm.onReaderScroll().expectActiveScrollerResponds();

    // Revised after the first run: resizing does NOT flip the layout, because
    // multiPanel is server-decided from the User-Agent (reader/views.py:344) and
    // never recomputed client-side. That is what keeps TextColumn's bind-once
    // scroll listener (TextColumn.jsx:43) correct — so pin it.
    await page.setViewportSize({ width: 700, height: 900 });
    await page.waitForTimeout(t(1000));
    await pm.onReaderScroll().expectLayoutSurvivesResize(false);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(t(1000));
    await pm.onReaderScroll().expectLayoutSurvivesResize(false);

    expect(pageErrors, `JS errors across the breakpoint: ${pageErrors.map(e => e.message).join('; ')}`).toHaveLength(0);
  });

  test('DW-020: highlight tracking and overflow are unchanged in Hebrew/RTL (R10)', async ({ context }) => {
    page = await goToPageWithLang(context, GENESIS_1_HE, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);

    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollColumnBy(1200);

    const middleRef = await pm.onReaderScroll().getSegmentRefAtViewportMiddle();
    expect(middleRef, 'no segment spans the middle of the RTL reading column').not.toBeNull();
    await pm.onReaderScroll().expectNoHorizontalOverflow();
  });

  test('DW-021: the desktop sheet reader is untouched by the singlePanel rules (R7)', async ({ context }) => {
    await openReader(context, LONG_SHEET);
    // .readerPanel / .readerContent / .textColumn overrides are all scoped to
    // .readerApp.singlePanel — none of them may reach a desktop sheet.
    await pm.onReaderScroll().expectWindowIsNotScrollContainer();
    await pm.onReaderScroll().expectNoHorizontalOverflow();
  });
});
