import { Locator, Page, expect } from '@playwright/test';
import { HelperBase } from './helperBase';
import { t } from '../globals';

/**
 * Mobile non-reader surfaces — the document-scroll contract outside the reader
 * (SC-30249 regression plan, MWS-### series).
 *
 * SC-30249's CSS is scoped to `.readerApp.singlePanel`, which is the app root on
 * EVERY mobile route — not just the reader. Two rules in that block reach far
 * beyond TextColumn:
 *
 *   #s2:has(.readerApp.singlePanel)          → position: static; height: auto
 *   .readerApp.singlePanel .readerNavMenu    → position: static; height: auto
 *   .readerApp.singlePanel .readerNavMenu .content → overflow-y: visible
 *
 * `.readerNavMenu` is the container for search, topics, the texts TOC, book
 * pages, profile, notifications, history and collections (SearchPage.jsx:29,
 * TextsPage.jsx:27, TopicPage.jsx:557, UserProfile.jsx:263, UserHistoryPanel.jsx:78,
 * NotificationsPanel.jsx:88, …), so all of those surfaces changed scroll model in
 * this diff. `.homeFeedWrapper` is UserStats — the Torah Tracker page
 * (ReaderApp.jsx:1317, UserStats.jsx:53).
 *
 * The failure mode these assertions hunt is "content is unreachable because an
 * ancestor is a fixed-height clipper" — which is exactly what removing the fixed
 * app shell can cause on a surface whose own CSS assumed that shell.
 *
 * Source of truth: static/css/s2.css (`#s2:has(.readerApp.singlePanel)` block).
 */
export class MobileSurfacesPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /** Any `.readerNavMenu`-based surface (texts TOC, search, topics, profile, …). */
  private get navMenu() {
    return this.page.locator('.readerNavMenu').first();
  }

  /** The scrollable body of a nav-menu surface — made `overflow-y: visible` by this diff. */
  private get navMenuContent() {
    return this.page.locator('.readerNavMenu .content').first();
  }

  /** UserStats / Torah Tracker container. */
  private get homeFeed() {
    return this.page.locator('.homeFeedWrapper').first();
  }

  private get searchResults() {
    return this.page.locator('.searchResultList .result');
  }

  private get searchResultCount() {
    return this.page.locator('.searchResultCount').first();
  }

  /** Chapter/section links on a book page's table of contents (BookPage.jsx:827). */
  private get sectionLinks() {
    return this.page.locator('.textTableOfContents .sectionLink');
  }

  /** Root-level category blocks on /texts (TextsPage.jsx). */
  private get navBlocks() {
    return this.page.locator('.readerNavMenu .navBlock');
  }

  private get sheetContent() {
    return this.page.locator('.sheetContent').first();
  }

  /** Top chrome that this diff pinned: fixed header + sticky reader controls. */
  private get topChrome() {
    return this.page.locator('.readerApp .header .headerInner, .readerControlsOuter');
  }

  // ---------------------------------------------------------------------------
  // Waits
  // ---------------------------------------------------------------------------

  /**
   * A nav-menu surface has rendered *content*, not just its wrapper. Per
   * CLAUDE.md §2.11, the container mounts before data streams in.
   */
  async waitForNavMenu() {
    await expect(this.navMenu).toBeVisible({ timeout: t(30000) });
    await expect(this.navMenuContent).toBeVisible({ timeout: t(30000) });
  }

  async waitForNavBlocks() {
    await this.waitForNavMenu();
    await expect(this.navBlocks.first()).toBeVisible({ timeout: t(30000) });
  }

  async waitForSectionLinks() {
    await expect(this.sectionLinks.first()).toBeVisible({ timeout: t(30000) });
  }

  async waitForSearchResults() {
    await expect(this.searchResultCount).toBeVisible({ timeout: t(40000) });
    await expect(this.searchResults.first()).toBeVisible({ timeout: t(40000) });
  }

  async waitForHomeFeed() {
    await expect(this.homeFeed).toBeVisible({ timeout: t(30000) });
  }

  async waitForSheet() {
    await expect(this.sheetContent).toBeVisible({ timeout: t(40000) });
    await expect(this.sheetContent.locator('.sheetItem').first()).toBeVisible({ timeout: t(40000) });
  }

  // ---------------------------------------------------------------------------
  // Scroll primitives
  //
  // Deliberately window-level: on singlePanel the document IS the scroll
  // container, so a window scroll that does nothing is itself the failure signal
  // this series is looking for. (ReaderScrollPage carries the same primitives for
  // the reader; each POM stays independently usable.)
  // ---------------------------------------------------------------------------

  async getScrollY(): Promise<number> {
    return this.page.evaluate(() => window.pageYOffset || document.documentElement.scrollTop);
  }

  async scrollToTop() {
    await this.page.evaluate(() => window.scrollTo(0, 0));
  }

  /**
   * Scroll to the document end, re-scrolling while the page keeps growing so
   * lazily-appended content (search results, feeds) is followed to its real end.
   * The waits here are deliberate pacing between scroll steps, not state-waiting —
   * the state assertions live in the expect* methods below.
   */
  async scrollToDocumentEnd(maxSteps = 12) {
    let previousHeight = -1;
    for (let i = 0; i < maxSteps; i++) {
      const height = await this.page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return document.documentElement.scrollHeight;
      });
      if (height === previousHeight) break;
      previousHeight = height;
      await this.page.waitForTimeout(t(500));
    }
  }

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  /**
   * MWS core: the document actually scrolls, and it scrolls all the way to the
   * end of its own content. A fixed-height clipper upstream shows up here as a
   * document that either never moves or stops short of its own scrollHeight.
   */
  async expectScrollsToEnd() {
    const initial = await this.page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(
      initial.scrollHeight,
      `document is not taller than the viewport (${initial.scrollHeight} <= ${initial.innerHeight}) — ` +
        'this surface has no content to scroll, so the row proves nothing; pick a longer page'
    ).toBeGreaterThan(initial.innerHeight);

    await this.scrollToDocumentEnd();

    const end = await this.page.evaluate(() => ({
      scrollY: window.pageYOffset || document.documentElement.scrollTop,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(end.scrollY, 'the document never scrolled').toBeGreaterThan(0);
    // Within 2px of the true end — allows sub-pixel rounding, catches a short stop.
    expect(
      end.scrollY + end.innerHeight,
      `document stopped ${end.scrollHeight - (end.scrollY + end.innerHeight)}px short of its own end`
    ).toBeGreaterThanOrEqual(end.scrollHeight - 2);
  }

  /**
   * The R1/R6 detector: no ANCESTOR of the surface's content root clips content
   * out of reach. Walks the chain from the content root up to `#s2` and fails on
   * any link that hides more than 8px of its own overflow.
   *
   * Scoped to the ancestor chain on purpose. The first run against the branch
   * showed that scanning every descendant of `#s2` reports design-intent clamps —
   * `div.cardDescription` (fixed-height card text, /topics) and `div#aboutCover`
   * (fixed-height hero, Voices) — neither of which appears in the SC-30249 diff
   * and neither of which is a scroll shell. The ancestor chain IS the R1/R6 risk:
   * a fixed-height wrapper that swallows a whole surface once `#s2` stops being
   * the app frame. Leaf-level clamps are out of scope by construction.
   */
  async expectNoClippedContent() {
    const offenders = await this.page.evaluate(() => {
      const root =
        document.querySelector<HTMLElement>('.readerNavMenu') ??
        document.querySelector<HTMLElement>('.homeFeedWrapper') ??
        document.querySelector<HTMLElement>('.readerContent') ??
        document.querySelector<HTMLElement>('.readerPanel');
      if (!root) return [{ selector: 'NO CONTENT ROOT FOUND', clientHeight: 0, scrollHeight: 0 }];

      const describe = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` +
        `${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;

      const found: { selector: string; clientHeight: number; scrollHeight: number }[] = [];
      for (let el: HTMLElement | null = root; el && el !== document.body; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (!['hidden', 'clip'].includes(style.overflowY)) continue;
        if (el.scrollHeight > el.clientHeight + 8) {
          found.push({ selector: describe(el), clientHeight: el.clientHeight, scrollHeight: el.scrollHeight });
        }
      }
      return found;
    });

    expect(
      offenders,
      `an ancestor is clipping content the user cannot reach: ${JSON.stringify(offenders)}`
    ).toEqual([]);
  }

  /**
   * R6: on singlePanel the nav-menu body must no longer be its own scroll
   * container — the document scrolls instead. If it still scrolls internally, the
   * mobile browser's URL bar will not collapse on any of these surfaces.
   *
   * Asserts "is not a scroller", not "overflow-y is visible". Topic pages carry
   * `.content.noOverflowX`, and `.noOverflowX { overflow-x: hidden }` (s2.css:451)
   * forces the other axis from `visible` to `auto` — the exact CSS trap the
   * SC-30249 comment cites as its reason for using `clip` on #s2. That computed
   * `auto` is harmless while the element's height stays auto and it never
   * overflows, which is what this checks.
   */
  async expectNavMenuContentNotAScroller() {
    const state = await this.navMenuContent.evaluate((el) => ({
      overflowY: getComputedStyle(el).overflowY,
      position: getComputedStyle(el.closest('.readerNavMenu') as HTMLElement).position,
      isScroller: el.scrollHeight > el.clientHeight + 8,
    }));
    expect(state.position).toBe('static');
    expect(
      state.isScroller,
      `.readerNavMenu .content is its own scroll container (overflow-y: ${state.overflowY}) — ` +
        'the document is not the scroller on this surface, so the URL bar will not collapse'
    ).toBe(false);
  }

  /** No side-to-side wobble: `overflow-x: clip` on #s2 must contain stray 100vw rules. */
  async expectNoHorizontalOverflow() {
    const state = await this.page.evaluate(() => ({
      scrollX: window.pageXOffset || document.documentElement.scrollLeft,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(state.scrollX).toBe(0);
    expect(state.docScrollWidth).toBeLessThanOrEqual(state.viewportWidth + 1);
  }

  /**
   * The composite most MWS rows want: the surface scrolls end-to-end, nothing is
   * clipped out of reach, and the horizontal axis never opens up.
   */
  async expectSurfaceScrollsCleanly() {
    await this.expectScrollsToEnd();
    await this.expectNoClippedContent();
    await this.expectNoHorizontalOverflow();
  }

  /**
   * The element can actually be brought on screen by scrolling.
   *
   * Not "is visible once the document is at its end": the first run showed that
   * surfaces render trailing chrome below their last content item, so scrolling
   * all the way down can leave that item above the fold — a pass/fail that says
   * nothing about reachability. Scrolling it into view and confirming it lands in
   * the viewport is the assertion the row actually wants.
   */
  async expectReachableByScrolling(target: Locator) {
    await expect(target).toBeAttached({ timeout: t(15000) });
    await target.scrollIntoViewIfNeeded();
    const inViewport = await target.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0 && rect.height > 0;
    });
    expect(inViewport, 'element cannot be brought into the viewport by scrolling').toBe(true);
  }

  /**
   * R3: the header is now `position: fixed` on every mobile surface. Anything the
   * user is meant to read or tap must not sit underneath it.
   */
  async expectNotCoveredByTopChrome(target: Locator) {
    await expect(target).toBeVisible({ timeout: t(15000) });
    const chromeBottom = await this.getTopChromeBottom();
    const top = await target.evaluate((el) => el.getBoundingClientRect().top);
    expect(
      top,
      `element top (${top}px) is underneath the fixed top chrome (bottom ${chromeBottom}px)`
    ).toBeGreaterThanOrEqual(chromeBottom - 1);
  }

  /**
   * MW-012: while the nav drawer is open, the surface behind it must stay put.
   * More likely to break now that the document — not an inner div — is the
   * scroller, so nothing structurally prevents scroll from bleeding through.
   */
  async expectDocumentDoesNotScrollBehindOverlay() {
    const before = await this.getScrollY();
    await this.page.evaluate(() => window.scrollBy(0, 600));
    await this.page.waitForTimeout(t(400));
    const after = await this.getScrollY();
    expect(
      Math.abs(after - before),
      `the page behind the overlay scrolled from ${before} to ${after} — scroll is bleeding through`
    ).toBeLessThanOrEqual(1);
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

  // ---------------------------------------------------------------------------
  // Surface-specific actions
  // ---------------------------------------------------------------------------

  /** MWS-002: the last chapter on a book page's TOC must still be tappable. */
  async tapLastSectionLink() {
    const last = this.sectionLinks.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible({ timeout: t(15000) });
    await last.tap();
  }

  lastNavBlock() {
    return this.navBlocks.last();
  }

  lastSearchResult() {
    return this.searchResults.last();
  }

  lastSheetItem() {
    return this.sheetContent.locator('.sheetItem').last();
  }

  homeFeedContainer() {
    return this.homeFeed;
  }
}
