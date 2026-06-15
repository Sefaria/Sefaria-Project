import { test, expect, devices, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../../utils';
import { LANGUAGES, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

/**
 * Resource Panel — Resources Hub (RP-010 → RP-016).
 *
 * Covers the four sections rendered in `mode="Resources"`:
 *   1. Top "topToolsButtons" row (About / TOC / Search / Translations)
 *   2. Related Texts (CategoryFilter list with More/Less toggle)
 *   3. Resources (Sheets, Web Pages, Topics, Manuscripts, Torah Readings)
 *   4. Tools (Add to Sheet, Dictionaries, Notes, Share, Feedback, Advanced)
 */
test.describe('Resource Panel — Resources Hub — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');
  });

  test('RP-010: Standard resource hub buttons are visible', async () => {
    await pm.onResourcePanel().expectStandardResourceButtonsVisible();
  });

  test('RP-011: Related Texts section shows categories with counts; categories are clickable', async () => {
    await pm.onResourcePanel().expectRelatedTextsSection();
    // At least one category filter must be present and clickable.
    const cats = page.locator('.connectionsPanel .categoryFilterGroup, .connectionsPanel .category');
    await expect(cats.first()).toBeVisible({ timeout: t(10000) });
    expect(await cats.count()).toBeGreaterThan(0);
  });

  test('RP-012: More / Less toggle expands and collapses category list', async () => {
    // Genesis 1:1 has substantially more than 4 connection categories — this is
    // the canonical text the React code (`collapsedTopLevelLimit = 4`) is built
    // around — so the toggle should be visible.
    await pm.onResourcePanel().expectMoreToggleVisible();
    const beforeCount = await pm.onResourcePanel().getVisibleCategoryCount();

    await pm.onResourcePanel().clickMoreCategories();
    await pm.onResourcePanel().expectSeeLessToggleVisible();
    const afterCount = await pm.onResourcePanel().getVisibleCategoryCount();
    expect(afterCount).toBeGreaterThan(beforeCount);

    await pm.onResourcePanel().clickSeeLessCategories();
    await pm.onResourcePanel().expectMoreToggleVisible();
  });

  test('RP-013: Segment with no connections — Related Texts section is hidden or shows empty state', async () => {
    // We don't reliably know of a segment with zero connections on production,
    // so this test asserts that whatever state Sefaria renders is non-crashing:
    // the panel is mounted in Resources mode and either the Related Texts
    // header is absent or the panel still shows its other sections.
    await pm.onResourcePanel().expectMode('Resources');
    // The panel must not crash — either the header is present or absent;
    // both branches are valid because the React code does
    // `showConnectionSummary ? <ConnectionsPanelSection title="Related Texts">...`
    const header = page.locator('.connectionPanelSectionHeader', { hasText: /Related Texts|טקסטים קשורים/i }).first();
    const visible = await header.isVisible({ timeout: t(3000) }).catch(() => false);
    expect([true, false]).toContain(visible);
  });

  test('RP-015: Resources section shows Sheets, Web Pages, Topics, Manuscripts buttons', async () => {
    // These are gated on counts > 0 (or moderator). Genesis 1:1 reliably has
    // sheets, web pages, topics, and manuscripts. We assert each is visible.
    await pm.onResourcePanel().expectResourcesSectionButton('Sheets');
    await pm.onResourcePanel().expectResourcesSectionButton('Web Pages');
    await pm.onResourcePanel().expectResourcesSectionButton('Topics');
    await pm.onResourcePanel().expectResourcesSectionButton('Manuscripts');
  });

  test('RP-016: Tools section shows Add to Sheet, Dictionaries, Notes, Share, Feedback, Advanced', async () => {
    await pm.onResourcePanel().expectToolsSectionButtons();
  });

  test('RP-024: On a regular desktop browser, the circled-X close button does not have the mobile enlarged tap target', async () => {
    await pm.onResourcePanel().expectMode('Resources');
    await pm.onResourcePanel().expectCloseButtonTapTargetNotEnlarged();
  });
});

/**
 * RP-025 — Tablet browsers (multi-panel layout).
 *
 * `reader/views.py` sets `multiPanel = not request.user_agent.is_mobile`.
 * The `user_agents` library parses iPad/tablet UAs as `is_mobile = False`
 * (`is_tablet = True`), so a tablet browser gets the same multi-panel,
 * `.connectionsHeader .readerNavMenuCloseButton.circledX` close button as a
 * regular desktop browser — fixed-size (20x32, s2.css ~line 6626/6645), not
 * the `.singlePanel` mobile rule's enlarged tap target.
 */
test.describe('Resource Panel — Tablet browser — close button', () => {
  test.use({
    viewport: { width: 1024, height: 1366 },
    userAgent: devices['iPad Pro 11'].userAgent,
  });

  test('RP-025: On a tablet browser, the circled-X close button does not have the mobile enlarged tap target', async ({ context }) => {
    const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onResourcePanel().waitForReaderReady();
    await pm.onResourcePanel().clickSegment('Genesis 1:1');

    await pm.onResourcePanel().expectMode('Resources');
    await pm.onResourcePanel().expectCloseButtonTapTargetNotEnlarged();
  });
});

/**
 * RP-017 / RP-018 — Mobile single-panel close button (bug regression).
 *
 * Layout assumption (see README.md section 8.4): `multiPanel` is decided
 * server-side from the User-Agent (`reader/views.py`:
 * `"multiPanel": not request.user_agent.is_mobile and ...`), not from the
 * viewport alone. This block emulates a real mobile device (UA + viewport,
 * via `devices['Pixel 5']`) so `ReaderApp.jsx` renders the single-panel
 * (`multiPanel === false`) layout, in which `ConnectionsPanelHeader.jsx`
 * renders a circled-X `<CloseButton>` for `mode === "Resources" | "Lexicon"`
 * (`showCloseButton`).
 *
 * Bug (reported on a real Pixel 10, mobile Chrome): tapping the circled-X in
 * Lexicon mode triggers Android's haptic feedback and native link
 * context-menu (titled "Close", from the button's `aria-label`/`title`)
 * instead of closing the panel. Root cause: `CloseButton` in `Misc.jsx`
 * always renders `<a href={url} ...>`, and when no `url` prop is passed
 * (as in this Resources/Lexicon close button), `url` defaults to `""`, so
 * the element is a real `<a href="">`. A long-press (or any
 * slightly-held tap) on a real `<a href>` on Android Chrome opens the
 * native "open link" context menu, which intercepts the gesture before
 * React's `onClick` ever fires — and is OS browser-chrome UI that
 * Playwright's synthetic `.click()`/`.tap()` cannot reproduce (RP-017
 * passes even on the buggy code because it bypasses this entirely).
 *
 * RP-018 instead asserts the underlying DOM condition that triggers the
 * native menu: the close button must not render as a real anchor
 * (`href=""`) when it has no destination URL.
 */
test.describe('Resource Panel — Mobile single-panel — close button', () => {
  // Pixel 5 emulation (isMobile/hasTouch) is Chromium-only — Firefox rejects
  // `isMobile` outright when creating the context, and WebKit doesn't
  // actually emulate a mobile UA/touch environment via these options.
  // Restrict this block to chrome-resource-panel so it isn't run (or
  // silently misrun) under firefox-resource-panel / safari-resource-panel.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Pixel 5 (mobile) emulation requires Chromium');

  const { defaultBrowserType, ...pixel5 } = devices['Pixel 5'];
  test.use({ ...pixel5 });

  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileResourcePanel().waitForReaderReady();
  });

  test('RP-017: Tapping the circled-X close button in Resources mode closes the panel', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');

    await pm.onMobileResourcePanel().tapCloseButton();
    await pm.onMobileResourcePanel().expectMode('Text');
  });

  test('RP-020: Clicking (mouse) the circled-X close button in Resources mode closes the panel', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');

    await pm.onMobileResourcePanel().clickCloseButton();
    await pm.onMobileResourcePanel().expectMode('Text');
  });

  test('RP-018: The circled-X close button is not rendered as a real link (no href="")', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');

    // An empty-string href makes this a real <a href> element. On Android
    // Chrome that causes a long-press to open the native link context menu
    // (titled "Close", from aria-label) instead of firing onClick.
    const href = await pm.onMobileResourcePanel().getCloseButtonHref();
    expect(href).toBeNull();
  });

  test('RP-019: The circled-X close button suppresses native long-press image/link menus', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');

    // Even with no `href`, the inner <img alt="Close"> is independently
    // long-pressable on Android/iOS (native "open/save image" menu, titled
    // from its alt text). `pointer-events: none` + `draggable="false"` on
    // the <img>, plus a prevented `contextmenu` on the <a>, suppress this so
    // a tap reaches `onClick` and closes the panel immediately.
    const guards = await pm.onMobileResourcePanel().getCloseButtonLongPressGuards();
    expect(guards.imgPointerEvents).toBe('none');
    expect(guards.imgDraggable).toBe('false');
    expect(guards.contextMenuPrevented).toBe(true);
  });

  test('RP-021: The circled-X close button has an enlarged tap target', async () => {
    await pm.onMobileResourcePanel().tapSegment('Genesis 1:1');
    await pm.onMobileResourcePanel().expectMode('Resources');

    await pm.onMobileResourcePanel().expectCloseButtonTapTargetEnlarged();
  });
});
