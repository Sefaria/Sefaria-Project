import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * SC-30249 — mobile non-reader surface regressions (MWS-### series).
 *
 * Rows come from e2e-tests/test-plans/sc-30249-regression.md §4. The reason this
 * file exists: SC-30249's CSS is scoped to `.readerApp.singlePanel`, which is the
 * app root on EVERY mobile route, so the diff changed the scroll model of far more
 * than the reader —
 *
 *   #s2:has(.readerApp.singlePanel)  → position: static; height: auto   (R1)
 *   .readerNavMenu                   → position: static; height: auto   (R6)
 *   .readerNavMenu .content          → overflow-y: visible              (R6)
 *   .homeFeedWrapper                 → position: static; height: auto   (R6)
 *   .headerInner                     → position: fixed                  (R3)
 *
 * `.readerNavMenu` is the container for the texts TOC, book pages, search, topics,
 * profile, saved, history and notifications. None of those had SC-30249 coverage
 * before this file, and the failure mode — content clipped out of reach because a
 * surface's own CSS assumed the fixed app shell — is invisible to the reader suite.
 *
 * The assertions are deliberately structural rather than data-shaped (CLAUDE.md
 * §2A): each row proves the document scrolls to the true end of its own content,
 * that nothing inside #s2 hides overflow the user can never reach, and that the
 * horizontal axis stays shut.
 *
 * Not automated (manual / follow-up):
 *   MWS-007 (editor half) — typing with the on-screen keyboard up; emulation does
 *                           not raise a real keyboard, so the caret/fixed-header
 *                           interaction is a real-device check (plan Series D).
 *
 * Runs under playwright.mobileweb.config.ts (Pixel 5 / iPhone 13, < 843px).
 */

const LIB = MODULE_URLS.EN.LIBRARY;
const VOICES = MODULE_URLS.EN.VOICES;

const TEXTS = `${LIB}/texts`;
const BOOK_PAGE = `${LIB}/Genesis`;
const SEARCH = `${LIB}/search?q=moses`;
const TOPIC = `${LIB}/topics/torah`;
const TOPICS_LANDING = `${LIB}/topics`;
// UserStats — the only `.homeFeedWrapper` in the app (UserStats.jsx:53,
// ReaderApp.jsx:1317). Logged-in surface.
const TORAH_TRACKER = `${LIB}/torahtracker`;
// /saved and /history are Voices-module surfaces (both rendered by
// UserHistoryPanel, which is a `.readerNavMenu`) — see the Voices Bookmarks suite.
const SAVED = `${VOICES}/saved`;
const HISTORY = `${VOICES}/history`;
// Public sheet, 41 sources (verified via /api/sheets/5156 — CLAUDE.md §2A), long
// enough to require scrolling on a phone. Read-only, so it does not collide with
// the Bookmarks suite's ownership of this id (that rule is about state mutation).
const LONG_SHEET = `${VOICES}/sheets/5156`;

test.describe('Mobile surfaces — document-level scrolling (SC-30249 regression)', () => {
  let page: Page;
  let pm: PageManager;

  const openAnon = async (context, url: string) => {
    page = await goToPageWithLang(context, url, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  };

  const openAsUser = async (context, url: string) => {
    page = await goToPageWithUser(context, url, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  };

  test('MWS-001: the texts TOC scrolls to the end of the category list (R1, R6)', async ({ context }) => {
    await openAnon(context, TEXTS);
    await pm.onMobileSurfaces().waitForNavBlocks();
    await pm.onMobileSurfaces().expectNavMenuContentNotAScroller();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
    await pm.onMobileSurfaces().expectReachableByScrolling(pm.onMobileSurfaces().lastNavBlock());
  });

  test('MWS-002: a book page TOC scrolls and the last chapter is still tappable (R6)', async ({ context }) => {
    await openAnon(context, BOOK_PAGE);
    await pm.onMobileSurfaces().waitForSectionLinks();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
    // Reachable is not enough — the last chapter must actually navigate.
    await pm.onMobileSurfaces().tapLastSectionLink();
    await expect(page).toHaveURL(/\/Genesis\.\d+/, { timeout: t(30000) });
  });

  test('MWS-003: search results scroll to the end of the loaded set (R6)', async ({ context }) => {
    await openAnon(context, SEARCH);
    await pm.onMobileSurfaces().waitForSearchResults();
    await pm.onMobileSurfaces().expectNavMenuContentNotAScroller();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
    await pm.onMobileSurfaces().expectReachableByScrolling(pm.onMobileSurfaces().lastSearchResult());
  });

  test('MWS-004: a topic page scrolls to the end of its sources (R6)', async ({ context }) => {
    await openAnon(context, TOPIC);
    await pm.onMobileSurfaces().waitForNavMenu();
    await pm.onMobileSurfaces().expectNavMenuContentNotAScroller();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
  });

  test('MWS-004b: the topics landing page scrolls to the end (R6)', async ({ context }) => {
    await openAnon(context, TOPICS_LANDING);
    await pm.onMobileSurfaces().waitForNavMenu();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
  });

  test('MWS-005: the Torah Tracker feed scrolls to its end (R1, R6)', async ({ context }) => {
    await openAsUser(context, TORAH_TRACKER);
    await pm.onMobileSurfaces().waitForHomeFeed();
    // .homeFeedWrapper is explicitly re-flowed to position:static/height:auto.
    const state = await pm.onMobileSurfaces().homeFeedContainer().evaluate((el) => ({
      position: getComputedStyle(el).position,
      height: getComputedStyle(el).height,
    }));
    expect(state.position).toBe('static');
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
  });

  test('MWS-006: saved and history panels scroll to their end (R6)', async ({ context }) => {
    await openAsUser(context, SAVED);
    await pm.onMobileSurfaces().waitForNavMenu();
    await pm.onMobileSurfaces().expectNavMenuContentNotAScroller();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();

    await page.goto(HISTORY);
    // A fresh survivor overlay can mount after an in-test navigation (CLAUDE.md §2.3).
    await hideAllModalsAndPopups(page);
    await pm.onMobileSurfaces().waitForNavMenu();
    await pm.onMobileSurfaces().expectNavMenuContentNotAScroller();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
  });

  test('MWS-007: a long sheet scrolls to its last source (R7)', async ({ context }) => {
    await openAnon(context, LONG_SHEET);
    await pm.onMobileSurfaces().waitForSheet();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
    await pm.onMobileSurfaces().expectReachableByScrolling(pm.onMobileSurfaces().lastSheetItem());
  });

  test('MWS-008: the hamburger drawer is not clipped and the page keeps its position (R1, R2, R3)', async ({ context }) => {
    await openAnon(context, TEXTS);
    await pm.onMobileSurfaces().waitForNavBlocks();
    await pm.onMobileSurfaces().scrollToDocumentEnd(3);
    const scrollBeforeOpen = await pm.onMobileSurfaces().getScrollY();
    expect(scrollBeforeOpen, 'the page did not scroll, so the restore check proves nothing').toBeGreaterThan(0);

    // waitForHeaderReady handles the staging cookies banner that
    // hideAllModalsAndPopups misses (mobile web/README.md §5).
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().openMenu();
    // `overflow-x: clip` on #s2 must not shear the off-canvas drawer.
    await pm.onMobileSurfaces().expectNoHorizontalOverflow();
    await pm.onMobileHamburger().closeMenu();

    await expect
      .poll(() => pm.onMobileSurfaces().getScrollY(), { timeout: t(10000) })
      .toBeGreaterThan(0);
  });

  test('MW-012: the surface behind the nav drawer does not scroll', async ({ context }) => {
    // From the story's original plan. Its steps said "the text column behind",
    // but a live probe showed the mobile *reader* renders no header and no
    // hamburger — only `.readerControlsOuter` — so the drawer is only reachable
    // from a nav surface. Same invariant, on a page where it can be exercised.
    await openAnon(context, TEXTS);
    await pm.onMobileSurfaces().waitForNavBlocks();
    await pm.onMobileSurfaces().scrollToDocumentEnd(3);
    const before = await pm.onMobileSurfaces().getScrollY();
    expect(before, 'the page did not scroll, so the lock check proves nothing').toBeGreaterThan(0);

    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().openMenu();
    await pm.onMobileSurfaces().expectDocumentDoesNotScrollBehindOverlay();
    await pm.onMobileHamburger().closeMenu();
  });

  test('MWS-009: the cookies/consent chrome positions correctly with #s2 static (R1, R3)', async ({ context }) => {
    // Deliberately does NOT call hideAllModalsAndPopups first — the point is that
    // overlays land in the right place now that #s2 no longer establishes a
    // fixed-height frame.
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await pm.onMobileSurfaces().waitForNavBlocks();
    await pm.onMobileSurfaces().expectNoHorizontalOverflow();
    // Whatever chrome is up, it must be inside the viewport, not stranded off it.
    await pm.onMobileSurfaces().expectNoClippedContent();
    await hideAllModalsAndPopups(page);
  });

  test('MWS-010: no stale document scroll leaks between surfaces (R1)', async ({ context }) => {
    await openAnon(context, `${LIB}/Genesis.1`);
    await pm.onReaderScroll().waitForSection('Genesis 1');
    await pm.onReaderScroll().scrollWindowBy(1500);
    await expect
      .poll(() => pm.onReaderScroll().getWindowScrollY(), { timeout: t(10000) })
      .toBeGreaterThan(0);

    await page.goto(TEXTS);
    await hideAllModalsAndPopups(page);
    await pm.onMobileSurfaces().waitForNavBlocks();
    // A freshly opened surface must start at its top, not inherit the reader's offset.
    expect(await pm.onMobileSurfaces().getScrollY()).toBe(0);
  });

  test('MWS-011: the Voices module scrolls cleanly on mobile (R1, R6)', async ({ context }) => {
    await openAnon(context, VOICES);
    await pm.onMobileSurfaces().waitForNavMenu();
    await pm.onMobileSurfaces().expectSurfaceScrollsCleanly();
  });
});
