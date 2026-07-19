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
    await expect(this.segment(ref)).toHaveClass(/highlight/, { timeout: t(10000) });
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
}
