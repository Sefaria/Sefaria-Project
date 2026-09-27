import { test, expect, Page, BrowserContext, devices } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { NG_SHORT_LANG, NgLanguage } from '../pages/ngReaderPage';
import { MODULE_URLS } from '../constants';

/**
 * NG Mobile Web — the new mobile reader (static/js/ng/, dispatched by reader/ng.py).
 *
 * Test IDs: NG-S### server dispatch and server HTML, NG-L### content language, NG-H### the
 * header and scrolling, NG-G### swipe gestures, NG-O### the overlay and history, NG-V###
 * versions, NG-P### pinned commentators, NG-T### the table-of-contents sheet, NG-Q### the
 * search-in-book sheet.
 *
 * What these tests assert, and why. Every check reads DOM state the reader publishes
 * (`data-overlay`, `data-state`, `data-phase`, `data-visible`, `data-language`, the URL) and
 * never how the page looks. Playwright's synthetic input does not model browser-internal
 * pointer and gesture bookkeeping faithfully (sefaria-wiki
 * conventions/playwright-synthetic-input-blind-spot), so:
 *   - swipes are real touch input (CDP Input.dispatchTouchEvent, through Chromium's touch
 *     pipeline and `touch-action`), not a mouse. The reader ignores mouse drags on purpose.
 *     CDP is Chromium-only, so the NG-G tests skip on the WebKit project: a harness limit.
 *   - the edge-zone test (NG-G003) arms a MutationObserver and asserts the drag never changed
 *     the overlay state at all, rather than inferring "nothing happened" from a screenshot.
 *   - a green NG-G run says the state machine and its wiring work. It does not say the swipe
 *     feels right, or that it coexists with iOS Safari's and Android's own edge gestures on a
 *     real phone. Keep a real-device pass for that.
 *
 * Data (verified against sefaria.org's API, CLAUDE.md §2A):
 *   - /api/v3/texts/Genesis.1.1?version=primary: MAM, "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים ..."
 *   - /api/texts/versions/Genesis.1: "The Koren Jerusalem Bible" is an English version that is
 *     not the default translation.
 *   - /api/links/Genesis.1.1: Rashi (category Commentary) comments on Genesis 1:1.
 *
 *   - /api/v2/index/Genesis: 50 chapters, 12 parashot (Noach starts at 6:9);
 *     /api/v2/index/Berakhot: text from 2a (1a and 1b are empty).
 *   - "light" in Genesis: 1:3, 1:4, 1:5, 1:14-1:18 match in the default translation.
 *     The NG-Q tests need POST /api/search-wrapper/es8 to answer; a local harness that can't
 *     reach it must stand it in at that boundary.
 *
 * Runs under playwright.mobileweb.config.ts. NG-S002 and NG-S003 need the real Django dispatch
 * (UA detection, `?ng=`, the classic reader), so they only pass against a sandbox or cauldron
 * running this branch.
 */

const LIBRARY = MODULE_URLS.EN.LIBRARY;
const LIBRARY_HE = MODULE_URLS.HE.LIBRARY;
const GENESIS_1 = `${LIBRARY}/Genesis.1`;
const GENESIS_1_BI = `${LIBRARY}/Genesis.1?lang=bi`;
const GENESIS_1_1_RASHI = `${LIBRARY}/Genesis.1.1?with=Rashi&lang=bi`;
const GENESIS_1_1_TEXT = 'בָּרָ֣א אֱלֹהִ֑ים';
const KOREN = 'The Koren Jerusalem Bible';

let page: Page;
let pm: PageManager;

const openReader = async (context: BrowserContext, url: string, language = LANGUAGES.EN) => {
  page = await goToPageWithLang(context, url, language);
  pm = new PageManager(page, language);
  await hideAllModalsAndPopups(page);
  await pm.onNgReader().waitForReady();
};

test.describe('NG Mobile Reader — server dispatch', () => {
  test('NG-S001: a mobile UA gets the NG reader, with the text in the server HTML', async ({ page: blank, userAgent }) => {
    const html = await new PageManager(blank, LANGUAGES.EN).onNgReader()
      .serverHtml(GENESIS_1_BI, userAgent || devices['Pixel 5'].userAgent);
    expect(html).toContain('data-ng="reader"');
    // The text is rendered on the server, not fetched after load (no #appLoading fallback).
    expect(html).not.toContain('id="appLoading"');
    expect(html).toMatch(/data-ng="segment" data-ref="Genesis 1:1"/);
    // NFC on both sides: the stored text's combining marks are not in canonical order.
    expect(html.normalize('NFC')).toContain(GENESIS_1_1_TEXT.normalize('NFC'));
  });

  test('NG-S002: a desktop UA keeps the classic reader', async ({ page: blank }) => {
    const html = await new PageManager(blank, LANGUAGES.EN).onNgReader()
      .serverHtml(GENESIS_1_BI, devices['Desktop Chrome'].userAgent);
    expect(html).not.toContain('data-ng="reader"');
    expect(html).toContain('readerApp');
  });

  test('NG-S003: ?ng=0 serves the classic reader, and the choice sticks', async ({ context }) => {
    page = await goToPageWithLang(context, `${GENESIS_1}?ng=0`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onNgReader().expectClassicReader();
    expect(await pm.onNgReader().cookie('ng')).toBe('0');

    // No parameter now: the cookie keeps the classic reader.
    await page.goto(GENESIS_1, { waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(page);
    await pm.onNgReader().expectClassicReader();

    // ?ng=auto clears the choice and goes back to UA detection.
    await page.goto(`${GENESIS_1}?ng=auto`, { waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(page);
    await pm.onNgReader().expectNgReader();
    expect(await pm.onNgReader().cookie('ng')).toBeNull();
  });
});

test.describe('NG Mobile Reader — content language', () => {
  const modes: { mode: NgLanguage; from: NgLanguage }[] = [
    { mode: 'hebrew', from: 'bilingual' },
    { mode: 'english', from: 'bilingual' },
    { mode: 'bilingual', from: 'hebrew' },
  ];

  for (const [i, { mode, from }] of modes.entries()) {
    test(`NG-L00${i + 1}: the config panel switches to ${mode}`, async ({ context }) => {
      await openReader(context, `${GENESIS_1}?lang=${NG_SHORT_LANG[from]}`);
      const ng = pm.onNgReader();
      await ng.expectLanguage(from, 'Genesis 1:1');

      await ng.openConfigFromHeader();
      await ng.chooseLanguage(mode);
      await ng.expectLanguage(mode, 'Genesis 1:1');
      await ng.expectUrlParam('lang', NG_SHORT_LANG[mode]);
      // The same cookie the classic reader and the server read, so ?ng=0 agrees.
      expect(await ng.cookie('contentLang')).toBe(mode);

      await ng.closeOverlayWithButton();
      await ng.expectLanguage(mode, 'Genesis 1:1');
    });
  }
});

test.describe('NG Mobile Reader — header and scrolling', () => {
  test('NG-H001: the header hides on forward scroll and returns on reverse scroll', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.expectHeaderVisible(true);
    await ng.scrollBy(600);
    await ng.expectHeaderVisible(false);
    await ng.scrollBy(-120);
    await ng.expectHeaderVisible(true);
  });

  test('NG-H002: infinite scroll into the next chapter updates the header ref', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.expectHeaderRef(/^Genesis\s*1:\d+$/);
    await ng.scrollUntilSectionLoads('Genesis 2');
    await ng.centerSegment('Genesis 2:5');
    await ng.expectHeaderRef(/^Genesis\s*2:\d+$/);
    await expect(page).toHaveURL(/\/Genesis\.2\?/, { timeout: t(15000) });
  });
});

test.describe('NG Mobile Reader — swipes (English interface)', () => {
  test.beforeEach(async ({ context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Real touch input goes through CDP, which only Chromium has');
    await openReader(context, GENESIS_1_BI);
  });

  test('NG-G001: a right-to-left drag opens associated texts from the right', async () => {
    const ng = pm.onNgReader();
    await ng.swipeAcrossText('leftward');
    await ng.expectOverlay('associated');
    await ng.expectPanelSide('right');
    // On the segment being read, and in the URL in the classic grammar.
    expect(await ng.associatedPanelRef()).toMatch(/^Genesis 1:\d+$/);
    await ng.expectUrlParam('with', 'all');
  });

  test('NG-G002: a left-to-right drag opens the config panel from the left', async () => {
    const ng = pm.onNgReader();
    await ng.swipeAcrossText('rightward');
    await ng.expectOverlay('config');
    await ng.expectPanelSide('left');
  });

  test('NG-G003: a drag that starts in an edge zone does nothing', async () => {
    const ng = pm.onNgReader();
    const width = await ng.viewportWidth();
    await ng.recordOverlayChanges();
    // Both edges are reserved for the OS back / forward gestures (gestures.js SWIPE.edgeZone, 24px).
    await ng.swipe({ x: width - 8, y: 460 }, { x: 60, y: 460 });
    await ng.swipe({ x: 8, y: 520 }, { x: width - 60, y: 520 });
    expect(await ng.overlayChanges()).toEqual([]);
    await ng.expectOverlay('none');

    // Control: the same drag clear of the edge does register, so the empty log above means something.
    await ng.swipeAcrossText('leftward');
    await ng.expectOverlay('associated');
    expect(await ng.overlayChanges()).toContain('overlay.data-phase=pulling');
  });

  // The axis lock (gestures.js): a drag commits to an axis after 8px, favoring vertical. Once it
  // locks horizontal, the reader preventDefault()s every touchmove, so the page cannot scroll
  // however the finger wobbles; a drag that reads as vertical is left to native scrolling.
  test('NG-G006: a mostly horizontal drag with vertical wobble opens the panel and never scrolls the page', async () => {
    const ng = pm.onNgReader();
    await ng.scrollBy(300);  // room to scroll both ways, so a stray scroll would show
    const width = await ng.viewportWidth();
    const before = await ng.scrollY();
    expect(before).toBeGreaterThan(100);
    await ng.recordTouchMoves();
    const x0 = width - 60;
    await ng.swipePath([
      { x: x0, y: 460 },
      { x: x0 - 12, y: 464 },       // the lock: 12px sideways, 4px down (18 degrees)
      { x: x0 - 70, y: 430 },       // then the finger wanders 30-40px up and down
      { x: x0 - 130, y: 495 },
      { x: x0 - 190, y: 445 },
      { x: 70, y: 500 },
    ], { stepsPerLeg: 5, durationMs: 380 });
    await ng.expectOverlay('associated');
    await ng.expectPanelSide('right');
    expect(await ng.scrollY()).toBe(before);
    // The lock itself: every move from the one that locks is prevented, whatever the finger's
    // dy. (Chromium doesn't dispatch the moves inside its own touch slop, so the first move the
    // page sees is already past the reader's 8px and locks; the jsdom tests cover the slop.)
    const prevented = await ng.touchMovesPrevented();
    expect(prevented.length).toBeGreaterThanOrEqual(15);
    expect(prevented.every(Boolean)).toBe(true);
  });

  test('NG-G007: a mostly vertical drag with sideways wobble scrolls and opens nothing', async () => {
    const ng = pm.onNgReader();
    await ng.recordOverlayChanges();
    await ng.recordTouchMoves();
    const before = await ng.scrollY();
    await ng.swipePath([
      { x: 200, y: 640 },
      { x: 206, y: 628 },           // 13px, mostly up: vertical
      { x: 250, y: 520 },           // then 40-50px sideways drift
      { x: 190, y: 400 },
      { x: 240, y: 280 },
    ], { stepsPerLeg: 5, durationMs: 320 });
    await expect.poll(() => ng.scrollY(), { timeout: t(5000) }).toBeGreaterThan(before + 150);
    expect(await ng.overlayChanges()).toEqual([]);
    await ng.expectOverlay('none');
    expect((await ng.touchMovesPrevented()).some(Boolean)).toBe(false);  // native scrolling, untouched
  });
});

test.describe('NG Mobile Reader — swipes (Hebrew interface)', () => {
  test.beforeEach(async ({ context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Real touch input goes through CDP, which only Chromium has');
    await openReader(context, `${LIBRARY_HE}/Genesis.1?lang=bi`, LANGUAGES.HE);
    await pm.onNgReader().expectInterface('hebrew');
  });

  test('NG-G004: a left-to-right drag opens associated texts from the left', async () => {
    const ng = pm.onNgReader();
    await ng.swipeAcrossText('rightward');
    await ng.expectOverlay('associated');
    await ng.expectPanelSide('left');
  });

  test('NG-G005: a right-to-left drag opens the config panel from the right', async () => {
    const ng = pm.onNgReader();
    await ng.swipeAcrossText('leftward');
    await ng.expectOverlay('config');
    await ng.expectPanelSide('right');
  });
});

test.describe('NG Mobile Reader — overlay, history and deep links', () => {
  test('NG-O001: browser Back closes the overlay and stays on the text', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    const before = new URL(page.url());
    await ng.openConfigFromHeader();
    await ng.goBack();
    await ng.expectOverlay('none');
    await expect.poll(() => new URL(page.url()).pathname).toBe(before.pathname);
    await ng.expectUrlParam('with', null);
  });

  test('NG-O002: a with=Rashi deep link opens the associated panel on Rashi', async ({ context }) => {
    await openReader(context, GENESIS_1_1_RASHI);
    const ng = pm.onNgReader();
    await ng.expectOverlay('associated');
    await ng.expectAssociatedPanel('Genesis 1:1', 'book');
    await ng.expectPanelTitle(/Rashi/);
    await ng.expectCommentFrom('Rashi on Genesis 1:1');
    await ng.expectUrlParam('with', 'Rashi');

    // History was seeded one entry per level: Back walks out to the segment's list, then closes.
    await ng.goBack();
    await ng.expectAssociatedPanel('Genesis 1:1', 'home');
    await ng.goBack();
    await ng.expectOverlay('none');
    await ng.expectUrlParam('with', null);
  });

  test('NG-V001: choosing a translation in the config panel updates ven= in the URL', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.openConfigFromHeader();
    await ng.openTranslationPicker();
    await ng.chooseVersion(KOREN);
    await ng.expectUrlParam('ven', `english|${KOREN.replace(/ /g, '_')}`);
    await ng.expectTranslationRow(/Koren/);
  });

  test('NG-P001: pinning a commentator shows it inline under the segment', async ({ context }) => {
    await openReader(context, GENESIS_1_1_RASHI);
    const ng = pm.onNgReader();
    await ng.expectAssociatedPanel('Genesis 1:1', 'book');
    await ng.togglePin();
    expect(await ng.storedPins()).toContain('"title":"Rashi"');
    await ng.closeOverlayWithButton();
    await ng.expectPinnedInline('Genesis 1:1', /\|Rashi$/);
  });
});

test.describe('NG Mobile Reader — table of contents sheet', () => {
  test('NG-T001: the contents icon and the ref are one control, opening a sheet over the text', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await expect(ng.headerTocControl).toHaveText(/^Genesis\s*1:\d+$/);
    await expect(ng.headerTocControl.locator('svg')).toHaveCount(1);
    await expect(page.locator('[data-ng="header"] a[href="/Genesis"]')).toHaveCount(1);  // no separate contents button
    await ng.markDocument();
    await ng.openTocFromHeader();
    await ng.expectSameDocument();
    await expect(page).toHaveURL(/\/Genesis\.1\?/);
    await expect(ng.headerTocControl).toHaveAttribute('aria-expanded', 'true');
  });

  test('NG-T002: Genesis opens on the current chapter; choosing one reads it in place, and Back returns', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.openTocFromHeader();
    await ng.expectCurrentTocSection('Genesis 1');
    await expect(page.locator('[data-ng="toc-section"]')).toHaveCount(50);
    await ng.markDocument();
    await ng.chooseTocSection('Genesis 12');
    await ng.expectSameDocument();
    await expect(page).toHaveURL(/\/Genesis\.12\?lang=bi$/);
    await ng.expectHeaderRef(/^Genesis\s*12:\d+$/);
    await ng.goBack();
    await expect(page).toHaveURL(/\/Genesis\.1\?lang=bi$/, { timeout: t(15000) });
    await ng.expectHeaderRef(/^Genesis\s*1:\d+$/);
  });

  test('NG-T003: a parasha opens at its first verse, marked for a moment', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.openTocFromHeader();
    await ng.openTocTab('Parasha');
    await page.locator('[data-ng="toc-alt-item"][data-ref="Genesis 6:9"]').tap();
    await ng.expectSheet('none');
    await ng.expectFlashed('Genesis 6:9');
    await expect(page).toHaveURL(/\/Genesis\.6\.9\?/);
  });

  test('NG-T004: Berakhot: a grid of amudim from 2a, on the current one', async ({ context }) => {
    await openReader(context, `${LIBRARY}/Berakhot.3b?lang=bi`);
    const ng = pm.onNgReader();
    await ng.openTocFromHeader();
    await ng.expectCurrentTocSection('Berakhot 3b');
    await expect(page.locator('[data-ng="toc-section"]').first()).toHaveAttribute('data-ref', 'Berakhot 2a');
    await ng.chooseTocSection('Berakhot 5a');
    await expect(page).toHaveURL(/\/Berakhot\.5a\?/);
  });

  test('NG-T005: Back, Escape and the close button each close the sheet and stay on the text', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    const path = new URL(page.url()).pathname;
    await ng.openTocFromHeader();
    await ng.goBack();
    await ng.expectSheet('none');
    await ng.openTocFromHeader();
    await page.keyboard.press('Escape');
    await ng.expectSheet('none');
    await ng.openTocFromHeader();
    await page.locator('[data-ng="sheet-close"]').tap();
    await ng.expectSheet('none');
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    await ng.expectOverlay('none');
  });

  test('NG-T006: a finger dragging the sheet down dismisses it', async ({ context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Real touch input goes through CDP, which only Chromium has');
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.openTocFromHeader();
    await ng.dragSheetDown();
    await ng.expectSheet('none');
  });

  test('NG-T007: the Hebrew interface mirrors the header: the icon leads the ref on the right', async ({ context }) => {
    await openReader(context, `${LIBRARY_HE}/Genesis.1?lang=bi`, LANGUAGES.HE);
    const ng = pm.onNgReader();
    await ng.expectInterface('hebrew');
    const icon = await ng.headerTocControl.locator('.ng-header-toc-icon').boundingBox();
    const text = await ng.headerTocControl.locator('.ng-header-ref-text').boundingBox();
    expect(icon!.x).toBeGreaterThan(text!.x + text!.width - 1);
    const search = await page.locator('[data-ng="header-search"]').boundingBox();
    expect(search!.x).toBeLessThan(text!.x);
    await ng.openTocFromHeader();
    await ng.expectCurrentTocSection('Genesis 1');
    await expect(ng.tocSection('Genesis 1')).toHaveText('א');
  });
});

test.describe('NG Mobile Reader — search in the book', () => {
  test('NG-Q001: the search button opens a sheet with a focused input that searches this book', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.markDocument();
    await ng.openSearchFromHeader();
    await ng.expectSameDocument();
    await expect(ng.searchInput).toBeFocused();
    await expect(ng.searchInput).toHaveAttribute('aria-label', 'Search in Genesis');
    await ng.searchFor('light');
    const refs = await ng.searchResultRefs();
    expect(refs.slice(0, 3)).toEqual(['Genesis 1:3', 'Genesis 1:4', 'Genesis 1:5']);
    expect(refs.every(r => r.startsWith('Genesis '))).toBe(true);
    await expect(ng.searchResult('Genesis 1:3').locator('mark').first()).toHaveText(/light/i);
  });

  test('NG-Q002: choosing a result reads that verse in place, marked for a moment', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.openSearchFromHeader();
    await ng.searchFor('light');
    await ng.chooseSearchResult('Genesis 1:16');
    await ng.expectFlashed('Genesis 1:16');
    await expect(page).toHaveURL(/\/Genesis\.1\.16\?lang=bi$/);
    await ng.goBack();
    await expect(page).toHaveURL(/\/Genesis\.1\?lang=bi$/, { timeout: t(15000) });
  });

  test('NG-Q003: a query with no matches says so', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.openSearchFromHeader();
    await ng.searchFor('qqxqzz');
    await expect(page.locator('[data-ng="search"]')).toHaveAttribute('data-status', 'ready');
    await expect(page.locator('[data-ng="search-result"]')).toHaveCount(0);
    await expect(page.locator('[data-ng="search-status"]')).toContainText('qqxqzz');
  });

  test('NG-Q004: Back closes search; reopening keeps the query', async ({ context }) => {
    await openReader(context, GENESIS_1_BI);
    const ng = pm.onNgReader();
    await ng.openSearchFromHeader();
    await ng.searchFor('light');
    await ng.goBack();
    await ng.expectSheet('none');
    await ng.openSearchFromHeader();
    await expect(ng.searchInput).toHaveValue('light');
    await expect(ng.searchResult('Genesis 1:3')).toBeVisible({ timeout: t(15000) });
  });

  test('NG-Q005: the Hebrew interface: a Hebrew query in a tractate, with Hebrew refs', async ({ context }) => {
    await openReader(context, `${LIBRARY_HE}/Berakhot.2a?lang=bi`, LANGUAGES.HE);
    const ng = pm.onNgReader();
    await ng.openSearchFromHeader();
    await ng.searchFor('קורין');
    const first = page.locator('[data-ng="search-result"]').first();
    await expect(first).toBeVisible();
    await expect(first.locator('.ng-search-ref')).toHaveText(/^ברכות/);
    await expect(first.locator('.ng-search-snippet-he mark').first()).toBeVisible();
  });
});
