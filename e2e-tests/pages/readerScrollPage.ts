import { Page, expect } from '@playwright/test';
import { HelperBase } from './helperBase';
import { t } from '../globals';

/**
 * Reader scroll mechanics — the TextColumn scroll-container contract (SC-30249).
 *
 * On singlePanel (viewport < 843px) the *document* is the scroll container so
 * mobile browsers can collapse their URL/nav bars during productive scrolling:
 * `#s2:has(.readerApp.singlePanel)` is `position: static` and `window` receives
 * the scroll events. On multiPanel (desktop) `#s2` stays `position: fixed` and
 * each `.textColumn` is its own scroll container.
 *
 * Source of truth: static/js/TextColumn.jsx (isWindowScroll / getLocalScrollTop /
 * setScrollTop) and static/css/s2.css (`#s2:has(.readerApp.singlePanel)` block).
 */
export class ReaderScrollPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get textColumn() {
    return this.page.locator('.textColumn').first();
  }

  private get headerInner() {
    return this.page.locator('.readerApp .header .headerInner');
  }

  private get readerControls() {
    return this.page.locator('.readerControlsOuter').first();
  }

  private get bookTitleBlock() {
    return this.page.locator('.bookMetaDataBox .title');
  }

  private get topLoadingIndicator() {
    return this.page.locator('.loadingMessage.base.prev');
  }

  private get connectionsOverlay() {
    return this.page.locator('.textList').first();
  }


  private get highlightedSegment() {
    return this.page.locator('.segment.invisibleHighlight').first();
  }

  /** Section-level TextRange, e.g. section('Genesis 2'). */
  section(ref: string) {
    return this.page.locator(`.textRange.basetext[data-ref="${ref}"]`);
  }

  /** Segment-level element, e.g. segment('Genesis 3:5'). */
  segment(ref: string) {
    return this.page.locator(`.segment[data-ref="${ref}"]`);
  }

  /** Wait for the reader to render a given section's text. */
  async waitForSection(ref: string) {
    await expect(this.section(ref)).toBeVisible({ timeout: t(30000) });
    // Section wrapper mounts before segments stream in — wait for a real child.
    await expect(this.section(ref).locator('.segment').first()).toBeVisible({ timeout: t(30000) });
  }

  async getWindowScrollY(): Promise<number> {
    return this.page.evaluate(() => window.pageYOffset || document.documentElement.scrollTop);
  }

  /**
   * Programmatic window scroll. Deliberately uses window.scrollBy rather than
   * mouse-wheel emulation: if the document is NOT the scroll container this is
   * a no-op, which is exactly the failure signal SC-30249 tests care about.
   * scrollBy fires real `scroll` events on window, so TextColumn.handleScroll runs.
   */
  async scrollWindowBy(deltaY: number) {
    await this.page.evaluate((dy) => window.scrollBy(0, dy), deltaY);
  }

  async scrollWindowToBottom() {
    await this.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  }

  async scrollWindowToTop() {
    await this.page.evaluate(() => window.scrollTo(0, 0));
  }

  /**
   * MW-003 core assertion: the document is the scroll container.
   * `#s2` must be position:static (not a fixed-height clipper), html/body must
   * not have scroll-disabling overflow, and window.scrollY must respond to scroll.
   */
  async expectDocumentIsScrollContainer() {
    const state = await this.page.evaluate(() => {
      const s2 = document.getElementById('s2');
      return {
        s2Position: s2 ? getComputedStyle(s2).position : null,
        htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        docTallerThanViewport: document.documentElement.scrollHeight > window.innerHeight,
      };
    });
    expect(state.s2Position).toBe('static');
    // Mobile browsers only collapse the URL bar when the root scroller has
    // clean overflow — 'hidden'/'scroll'/'auto' on html or body disables it.
    expect(['visible']).toContain(state.htmlOverflowY);
    expect(['visible']).toContain(state.bodyOverflowY);
    expect(state.docTallerThanViewport).toBe(true);

    await this.scrollWindowBy(600);
    await expect
      .poll(() => this.getWindowScrollY(), { timeout: t(10000) })
      .toBeGreaterThan(0);
  }

  /**
   * Desktop counterpart (DW-006 / DW-009): window must NOT scroll and the
   * singlePanel CSS block must not have leaked onto the multiPanel layout.
   */
  async expectWindowIsNotScrollContainer() {
    const state = await this.page.evaluate(() => {
      const s2 = document.getElementById('s2');
      return {
        s2Position: s2 ? getComputedStyle(s2).position : null,
        isMultiPanel: !!document.querySelector('.readerApp.multiPanel'),
      };
    });
    expect(state.s2Position).toBe('fixed');
    expect(state.isMultiPanel).toBe(true);

    await this.scrollWindowBy(600);
    // Give any (incorrect) scroll a beat to happen, then confirm it didn't.
    await this.page.waitForTimeout(t(300));
    expect(await this.getWindowScrollY()).toBe(0);
  }

  /**
   * Scroll the window in steps until a section is attached to the DOM
   * (infinite scroll loads it). Steps are paced so TextColumn's scroll
   * handler + API fetch can run between them — this is deliberate pacing,
   * not state-waiting (the state wait is the toBeAttached at the end).
   */
  async scrollWindowUntilSectionLoads(ref: string, direction: 'down' | 'up', maxSteps = 20) {
    const target = this.section(ref);
    for (let i = 0; i < maxSteps; i++) {
      if ((await target.count()) > 0) break;
      if (direction === 'down') {
        await this.scrollWindowToBottom();
      } else {
        // Nudge away from the top first: the top-load only fires on a scroll
        // *event*, and re-setting an already-0 scrollTop fires none.
        await this.page.evaluate(() => window.scrollTo(0, 200));
        await this.page.waitForTimeout(t(150));
        await this.scrollWindowToTop();
      }
      await this.page.waitForTimeout(t(500));
    }
    await expect(target.first()).toBeAttached({ timeout: t(30000) });
  }

  /** Same loop for the desktop .textColumn scroll container. */
  async scrollColumnUntilSectionLoads(ref: string, direction: 'down' | 'up', maxSteps = 20) {
    const target = this.section(ref);
    for (let i = 0; i < maxSteps; i++) {
      if ((await target.count()) > 0) break;
      if (direction === 'down') {
        await this.textColumn.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      } else {
        // Nudge away from the top first: the top-load only fires on a scroll
        // *event*, and re-setting an already-0 scrollTop fires none.
        await this.textColumn.evaluate((el) => { el.scrollTop = 200; });
        await this.page.waitForTimeout(t(150));
        await this.textColumn.evaluate((el) => { el.scrollTop = 0; });
      }
      await this.page.waitForTimeout(t(500));
    }
    await expect(target.first()).toBeAttached({ timeout: t(30000) });
  }

  /**
   * Bring an already-loaded section to the top of the viewport.
   *
   * Infinite scroll only *attaches* the next section below the fold — it does
   * not scroll into it. The header/URL track the section that is actually
   * visible (TextColumn.adjustHighlightedAndVisible), so any URL assertion
   * after a `scroll*UntilSectionLoads` call needs this step to be deliberate
   * instead of depending on where the load happened to leave the viewport.
   * Works in both scroll modes: `scrollIntoView` targets the nearest scrollable
   * ancestor, which is `.textColumn` on multiPanel and the document on singlePanel.
   */
  async scrollSectionIntoView(ref: string) {
    const target = this.section(ref).first();
    await expect(target).toBeAttached({ timeout: t(30000) });
    await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    // Pacing, not state-waiting: let the debounced scroll handler (100ms) run.
    await this.page.waitForTimeout(t(300));
  }

  async scrollColumnBy(deltaY: number) {
    await this.textColumn.evaluate((el, dy) => { el.scrollTop += dy; }, deltaY);
  }

  async getColumnScrollTop(): Promise<number> {
    return this.textColumn.evaluate((el) => el.scrollTop);
  }

  /**
   * MW-010 / MW-015: no horizontal overflow or wobble. Atomic evaluate so the
   * three reads can't race a mid-flight scroll.
   */
  async expectNoHorizontalOverflow() {
    const state = await this.page.evaluate(() => ({
      scrollX: window.pageXOffset || document.documentElement.scrollLeft,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(state.scrollX).toBe(0);
    // Allow 1px for sub-pixel rounding.
    expect(state.docScrollWidth).toBeLessThanOrEqual(state.viewportWidth + 1);
  }

  /**
   * MW-011: top chrome stays pinned to the viewport top while the document
   * scrolls beneath it (position:fixed header / sticky reader controls).
   */
  async expectTopChromePinned() {
    const pinned = this.page.locator(
      '.readerApp .header .headerInner, .readerControlsOuter'
    ).first();
    await expect(pinned).toBeVisible({ timeout: t(10000) });
    const box = await pinned.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y)).toBeLessThanOrEqual(1);
  }

  /**
   * MW-007 / DW-005: after a direct segment-URL load, the highlighted segment
   * must already be in the viewport without any manual scroll.
   */
  async expectHighlightedSegmentInViewport(ref: string) {
    const seg = this.segment(ref);
    await expect(seg).toBeVisible({ timeout: t(30000) });
    await expect(seg).toHaveClass(/invisibleHighlight|highlight/, { timeout: t(10000) });
    await expect
      .poll(
        () =>
          seg.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return rect.top >= 0 && rect.top < window.innerHeight;
          }),
        { timeout: t(10000) }
      )
      .toBe(true);
  }

  /** MW-008: tap a segment to open the TextAndConnections overlay. */
  async tapSegmentToOpenConnections(ref: string) {
    const seg = this.segment(ref);
    await expect(seg).toBeVisible({ timeout: t(30000) });
    await seg.tap();
    await expect(this.connectionsOverlay).toBeVisible({ timeout: t(15000) });
    // `invisibleHighlight` is the class always applied to a highlighted segment;
    // the bare `highlight` class only appears when showHighlight is on. The
    // previous `/highlight/` pattern is case-sensitive and therefore does NOT
    // match "invisibleHighlight" — it failed against a real branch build. Match
    // the same pair expectHighlightedSegmentInViewport already uses.
    await expect(this.segment(ref)).toHaveClass(/invisibleHighlight|highlight/, { timeout: t(10000) });
  }

  /**
   * MW-009: close the connections overlay and return to normal reading.
   * The mobile TextAndConnections overlay renders no close button — opening it
   * pushes a history entry (?with=all), and browser Back is the designed exit
   * (verified against the live DOM: .connectionsPanelHeader has only a title).
   */
  async closeConnectionsOverlay() {
    await this.page.goBack();
    await expect(this.connectionsOverlay).toBeHidden({ timeout: t(15000) });
  }

  async expectConnectionsClosed() {
    await expect(this.connectionsOverlay).toBeHidden({ timeout: t(10000) });
    await expect(this.page.locator('.textColumn.connectionsOpen')).toHaveCount(0, { timeout: t(10000) });
  }

  /**
   * MW-016: at the very top of a book, the title block renders instead of a
   * "Loading..." placeholder (noPrev branch in TextColumn.render).
   */
  async expectBookTitleAtTop() {
    await expect(this.bookTitleBlock).toBeVisible({ timeout: t(30000) });
    await expect(this.topLoadingIndicator).toHaveCount(0);
  }

  // ===========================================================================
  // SC-30249 regression additions — see e2e-tests/test-plans/sc-30249-regression.md
  // ===========================================================================

  /** Chrome this diff pinned: fixed `.headerInner` (R3) + sticky `.readerControlsOuter` (R4). */
  private get topChrome() {
    return this.page.locator('.readerApp .header .headerInner, .readerControlsOuter');
  }

  /** Lowest edge of any pinned top chrome currently on screen. */
  async getTopChromeBottom(): Promise<number> {
    return this.topChrome.evaluateAll((els) =>
      els
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (!['fixed', 'sticky'].includes(style.position)) return false;
          const rect = el.getBoundingClientRect();
          return rect.height > 0 && rect.top <= 1;
        })
        .reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom), 0)
    );
  }

  /**
   * MW-019 (R3 + R4): the now-fixed header and the sticky reader controls must
   * stack, not overlap. Both are pinned to `top: 0` by the new CSS, so an
   * ordering/height mistake hides one behind the other.
   */
  async expectTopChromeDoesNotOverlap() {
    const boxes = await this.topChrome.evaluateAll((els) =>
      els
        .filter((el) => {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          return ['fixed', 'sticky'].includes(style.position);
        })
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { cls: el.className, top: rect.top, bottom: rect.bottom };
        })
        .sort((a, b) => a.top - b.top)
    );

    for (let i = 1; i < boxes.length; i++) {
      expect(
        boxes[i].top,
        `pinned chrome overlaps: "${boxes[i - 1].cls}" ends at ${boxes[i - 1].bottom}px ` +
          `but "${boxes[i].cls}" starts at ${boxes[i].top}px`
      ).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1);
    }
  }

  /**
   * MW-019: at scrollY 0 the first segment must be fully readable, not tucked
   * under the fixed header / sticky controls.
   */
  async expectFirstSegmentBelowTopChrome() {
    const first = this.page.locator('.basetext .segment').first();
    await expect(first).toBeVisible({ timeout: t(30000) });
    const ref = await first.getAttribute('data-ref');
    expect(ref, 'the first segment has no data-ref to anchor on').not.toBeNull();
    await this.expectSegmentBelowTopChrome(ref!);
  }

  /**
   * MW-021 (R11): a deep-linked segment must land *below* the pinned chrome, not
   * merely inside the viewport. `setInitialScrollPosition` computes its target
   * from `$highlighted.position().top` (relative to the offsetParent, which the
   * new CSS makes `#panelWrapBox`) while `setScrollTop` adds the `.textColumn`'s
   * own document offset — so an off-by-the-gap landing is the specific risk here.
   */
  async expectSegmentBelowTopChrome(ref: string) {
    const seg = this.segment(ref);
    await expect(seg).toBeVisible({ timeout: t(30000) });
    const chromeBottom = await this.getTopChromeBottom();
    const top = await seg.evaluate((el) => el.getBoundingClientRect().top);
    expect(
      top,
      `segment ${ref} sits at ${top}px, underneath pinned chrome ending at ${chromeBottom}px`
    ).toBeGreaterThanOrEqual(chromeBottom - 1);
  }

  /** DW-013 / DW-015: the desktop column's own scroll geometry. */
  async getColumnScrollMetrics() {
    return this.textColumn.evaluate((el) => ({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      atHardBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
    }));
  }

  /** MW-017: the mobile document's scroll geometry vs. the column's own height. */
  async getDocumentScrollMetrics() {
    return this.page.evaluate(() => {
      const col = document.querySelector<HTMLElement>('.textColumn');
      return {
        scrollY: window.pageYOffset || document.documentElement.scrollTop,
        docScrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        // TextColumn's guard on mobile: getScrollHeight() is the column's
        // offsetHeight, getClientHeight() is window.innerHeight (TextColumn.jsx:70-73).
        columnOffsetHeight: col ? col.offsetHeight : 0,
        guardWouldEarlyReturn: col ? col.offsetHeight <= window.innerHeight : true,
      };
    });
  }

  async scrollColumnToBottom() {
    await this.textColumn.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  }

  /**
   * DW-013 (R9): infinite scroll down must fire *before* the column reaches its
   * hard bottom. The diff swapped `$container.outerHeight()` for
   * `node.clientHeight` in adjustInfiniteScroll (TextColumn.jsx:302), shifting
   * the trigger threshold by the border/scrollbar delta — a shift far enough in
   * the wrong direction leaves the reader parked at a dead bottom.
   *
   * Scrolls in three-quarter-viewport steps and records whether the column ever
   * bottomed out before the next section attached.
   */
  async expectNextSectionLoadsBeforeHardBottom(ref: string, maxSteps = 20) {
    const target = this.section(ref);
    let bottomedOutBeforeLoad = false;

    for (let i = 0; i < maxSteps; i++) {
      if ((await target.count()) > 0) break;
      const metrics = await this.getColumnScrollMetrics();
      if (metrics.atHardBottom) bottomedOutBeforeLoad = true;
      await this.textColumn.evaluate((el) => { el.scrollTop += el.clientHeight * 0.75; });
      await this.page.waitForTimeout(t(500));
    }

    await expect(target.first()).toBeAttached({ timeout: t(30000) });
    expect(
      bottomedOutBeforeLoad,
      `${ref} only loaded after the column hit its hard bottom — the reader shows a dead stop ` +
        'before the next section appears (adjustInfiniteScroll threshold regression)'
    ).toBe(false);
  }

  /**
   * DW-014 (R10): which segment is actually at the middle of the reading
   * viewport. Highlight detection moved from jQuery `.offset()` to
   * `getBoundingClientRect()` in this diff, for both layouts.
   *
   * Measures inside the `.textColumn` frame on multiPanel (the column is fixed at
   * the viewport) and viewport-relative on singlePanel (the document scrolls) —
   * mirroring adjustHighlightedAndVisible's own branch.
   */
  async getSegmentRefAtViewportMiddle(): Promise<string | null> {
    return this.page.evaluate(() => {
      const isMultiPanel = !!document.querySelector('.readerApp.multiPanel');
      const col = document.querySelector<HTMLElement>('.textColumn');
      if (!col) return null;
      const colRect = col.getBoundingClientRect();
      const middle = isMultiPanel
        ? colRect.top + Math.min(colRect.height, window.innerHeight) / 2
        : window.innerHeight / 2;

      const segments = Array.from(col.querySelectorAll<HTMLElement>('.basetext .segment'));
      const hit = segments.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.top <= middle && rect.bottom >= middle;
      });
      return hit ? hit.getAttribute('data-ref') : null;
    });
  }

  /** DW-017 / DW-018 / MW-020: which segments the reader can currently see. */
  async getVisibleSegmentRefs(): Promise<string[]> {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.textColumn .basetext .segment'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.bottom > 0 && rect.top < window.innerHeight;
        })
        .map((el) => el.getAttribute('data-ref') ?? '')
        .filter(Boolean)
    );
  }

  /**
   * Reading position is preserved across a re-layout if *any* of the previously
   * visible segments is still on screen. Deliberately looser than an exact
   * scrollTop match: both restore paths (scrollToHighlighted on a content change,
   * restoreScrollPositionByPercentage on a width change) reposition
   * approximately, so a small drift is by design — a jump to the top is not.
   */
  async expectReadingPositionPreserved(before: string[]) {
    expect(before.length, 'no segments were visible before the layout change').toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const after = await this.getVisibleSegmentRefs();
          return after.some((ref) => before.includes(ref));
        },
        { timeout: t(15000) }
      )
      .toBe(true);
  }

  /**
   * MW-018 (R5): the connections overlay went from in-flow inside a fixed shell
   * to `position: fixed; height: 54vh; bottom: 0`. It must sit flush with the
   * bottom of the viewport and stay pinned there while the document scrolls
   * beneath it.
   *
   * NOTE: whether the document *should* be scroll-locked behind the overlay is a
   * product question raised by the plan, not asserted here.
   */
  async expectConnectionsOverlayPinnedToBottom() {
    const before = await this.connectionsOverlay.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { position: getComputedStyle(el).position, top: rect.top, bottom: rect.bottom, innerHeight: window.innerHeight };
    });
    expect(before.position).toBe('fixed');
    expect(Math.abs(before.bottom - before.innerHeight)).toBeLessThanOrEqual(1);

    await this.scrollWindowBy(400);
    await this.page.waitForTimeout(t(300));

    const after = await this.connectionsOverlay.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    expect(
      Math.abs(after.top - before.top),
      'the connections overlay drifted while the document scrolled — it is not pinned'
    ).toBeLessThanOrEqual(1);
  }

  /**
   * DW-016 (R1 + R8): with the connections sidebar open on desktop, the window
   * must still never scroll and `.textColumn` must remain the only scroller.
   */
  async expectColumnScrollsWithoutMovingWindow() {
    const startScrollTop = await this.getColumnScrollTop();
    await this.scrollColumnBy(600);
    await this.page.waitForTimeout(t(300));
    expect(await this.getColumnScrollTop()).toBeGreaterThan(startScrollTop);
    expect(await this.getWindowScrollY(), 'the window scrolled on a multiPanel layout').toBe(0);
  }

  /** Is the reader currently in window-scroll (singlePanel) mode? */
  async isSinglePanel(): Promise<boolean> {
    return this.page.evaluate(() => !!document.querySelector('.readerApp.singlePanel'));
  }

  /**
   * Open the reader's display-settings menu and pick a source/translation mode —
   * a re-layout that makes restoreScrollPositionByPercentage run.
   *
   * Locators are grounded in the component source rather than roles: the toggle
   * is a `<span className="readerOptions">` inside a ToolTipped (Misc.jsx:1284),
   * NOT a `role="button"`, and the options are `<input type="radio">` whose
   * `value` is the English string while the visible label is i18n'd
   * (SourceTranslationsButtons.jsx:24-26, common/RadioButton.jsx:24) — so `value`
   * is the interface-language-invariant anchor per CLAUDE.md rule 15.
   */
  async setSourceTranslationMode(value: 'Source' | 'Translation' | 'Source with Translation') {
    const toggle = this.page.locator('.readerOptions').first();
    await expect(toggle).toBeVisible({ timeout: t(15000) });
    await toggle.click();

    const menu = this.page.locator('.texts-properties-menu[role="dialog"]');
    await expect(menu).toBeVisible({ timeout: t(10000) });
    await menu.locator(`input[type="radio"][value="${value}"]`).check();
  }

  /**
   * The live scroller responds to input. Which one is live is decided by
   * `multiPanel`, a prop the server sets from the User-Agent (reader/views.py:344)
   * and which never changes client-side — see expectLayoutSurvivesResize.
   */
  async expectActiveScrollerResponds() {
    if (await this.isSinglePanel()) {
      await this.scrollWindowBy(600);
      await expect.poll(() => this.getWindowScrollY(), { timeout: t(10000) }).toBeGreaterThan(0);
    } else {
      await this.scrollColumnBy(600);
      await expect.poll(() => this.getColumnScrollTop(), { timeout: t(10000) }).toBeGreaterThan(0);
    }
  }

  /**
   * DW-019 (R8), revised after the first run against the branch.
   *
   * The original row assumed a viewport resize across 843px flips the layout, so
   * that TextColumn's never-rebound scroll listener (bound once at
   * componentDidMount, TextColumn.jsx:43) would end up on the wrong target. It
   * does not: `multiPanel` is decided SERVER-SIDE from the User-Agent
   * (reader/views.py:344) and passed as a prop that nothing recomputes —
   * ReaderApp's only resize listener adjusts the panel cap (ReaderApp.jsx:197).
   *
   * So this pins the behavior that actually exists: the layout a page loaded with
   * survives a resize, and the scroller it bound at mount keeps working. That
   * also means the CSS (`.readerApp.singlePanel`) and the JS (`isWindowScroll()`)
   * read the same constant and cannot disagree mid-session.
   */
  // ---------------------------------------------------------------------------
  // Rows adopted from the story's original test plan (DW-006 two-panel, DW-007,
  // DW-008, DW-010, MW-012, MW-013). Locators below were probed against a live
  // branch build before being written (CLAUDE.md rule 10 / rule 14).
  // ---------------------------------------------------------------------------

  /** Connection category rows in the desktop sidebar, e.g. "Commentary (698)". */
  private get connectionCategoryFilters() {
    return this.page.locator('.readerPanelBox.sidebar .categoryFilter');
  }

  private get connectionTextFilters() {
    return this.page.locator('.readerPanelBox.sidebar .textFilter');
  }

  /** The "Open" affordance on a connection — opens it as a second text panel. */
  private get connectionOpenLinks() {
    return this.page.locator('.readerPanelBox.sidebar .connection-button.panel-open-link');
  }

  private get textColumns() {
    return this.page.locator('.textColumn');
  }

  /**
   * DW-007: the sidebar's per-category connection counts are computed for the
   * currently highlighted segment, so they are the observable proof that the
   * connections panel is tracking the highlight. Verified live: Genesis 1:1 shows
   * "Commentary (698)", Genesis 1:12 shows "Commentary (82)".
   */
  async getConnectionCategoryCounts(): Promise<string[]> {
    await expect(this.connectionCategoryFilters.first()).toBeVisible({ timeout: t(30000) });
    return this.connectionCategoryFilters.evaluateAll((els) =>
      els.map((el) => (el.textContent ?? '').trim().slice(0, 30))
    );
  }

  /**
   * DW-006 (their version): open a connection as a genuine SECOND TEXT PANEL.
   * Path probed live: category row → commentator row → "Open" button, which
   * pushes `p2=` onto the URL and mounts a second `.textColumn`.
   */
  async openSecondTextPanelFromConnections() {
    await this.connectionCategoryFilters.first().click();
    await expect(this.connectionTextFilters.first()).toBeVisible({ timeout: t(20000) });
    await this.connectionTextFilters.first().click();

    const open = this.connectionOpenLinks.first();
    await expect(open).toBeVisible({ timeout: t(20000) });
    await open.click();

    await expect(this.textColumns).toHaveCount(2, { timeout: t(30000) });
    await expect(this.page).toHaveURL(/p2=/, { timeout: t(20000) });
  }

  async getColumnScrollTopAt(index: number): Promise<number> {
    return this.textColumns.nth(index).evaluate((el) => el.scrollTop);
  }

  async scrollColumnAt(index: number, deltaY: number) {
    await this.textColumns.nth(index).evaluate((el, dy) => { el.scrollTop += dy; }, deltaY);
  }

  /**
   * DW-006: with two text panels open, each must remain its own scroll container
   * and the window must still never move.
   */
  async expectPanelsScrollIndependently() {
    await expect(this.textColumns).toHaveCount(2, { timeout: t(15000) });
    const otherBefore = await this.getColumnScrollTopAt(1);

    await this.scrollColumnAt(0, 800);
    await this.page.waitForTimeout(t(500));

    expect(await this.getColumnScrollTopAt(0), 'the first panel did not scroll').toBeGreaterThan(0);
    expect(
      await this.getColumnScrollTopAt(1),
      'scrolling one panel moved the other — the panels share a scroll container'
    ).toBe(otherBefore);
    expect(await this.getWindowScrollY(), 'the window scrolled on a multiPanel layout').toBe(0);
  }

  async expectLayoutSurvivesResize(expectedSinglePanel: boolean) {
    expect(
      await this.isSinglePanel(),
      'the layout flipped on resize — multiPanel is no longer a load-time constant, ' +
        'which re-opens the never-rebound scroll listener risk (R8)'
    ).toBe(expectedSinglePanel);
    await this.expectActiveScrollerResponds();
  }
}
