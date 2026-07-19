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
 */

const GENESIS_1 = `${MODULE_URLS.EN.LIBRARY}/Genesis.1`;
const GENESIS_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.5`;
const GENESIS_3_5 = `${MODULE_URLS.EN.LIBRARY}/Genesis.3.5`;
const RUTH_1 = `${MODULE_URLS.EN.LIBRARY}/Ruth.1`;

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
});
