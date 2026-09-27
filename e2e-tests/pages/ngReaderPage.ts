import { CDPSession, Page, expect } from '@playwright/test';
import { HelperBase } from './helperBase';
import { t } from '../globals';

export type NgLanguage = 'hebrew' | 'english' | 'bilingual';
export type NgOverlay = 'none' | 'associated' | 'config' | 'toc' | 'search';
export type NgSheet = 'toc' | 'search';
type Point = { x: number; y: number };

/** URL `lang=` values for the three content languages (static/js/ng/text.js shortLang). */
export const NG_SHORT_LANG: Record<NgLanguage, string> = { hebrew: 'he', english: 'en', bilingual: 'bi' };

/**
 * NG Mobile Web reader: the React tree under static/js/ng/, served in place of ReaderApp on a
 * mobile UA (reader/ng.py use_ng_reader).
 *
 * Every locator here uses the tree's `data-ng` anchors, which don't change with the interface
 * language (CLAUDE.md rule 15), and assertions read the DOM state the reader publishes rather than
 * what it looks like:
 *   - `[data-ng="reader"]` data-overlay (none | associated | config), data-interface, data-hydrated
 *   - `[data-ng="overlay"]` data-state (the overlay state) and data-phase (what is on screen)
 *   - `[data-ng="header"]` data-visible
 *   - `[data-ng="stream"]` data-language
 *   - `[data-ng="sheets"]` data-state (toc | search | none), `[data-ng="sheet-layer"]` data-phase
 *
 * Swipes go through real touch input: CDP `Input.dispatchTouchEvent`, which reaches the page as
 * touch events through Chromium's touch pipeline, `touch-action` and scrolling included. The
 * reader listens to touch events only (it must preventDefault a touchmove to hold the page still
 * during a swipe), so Playwright's synthetic mouse can't exercise it. CDP is Chromium-only:
 * callers skip swipes on WebKit.
 */
export class NgReaderPage extends HelperBase {
  private cdp: CDPSession | null = null;

  constructor(page: Page, language: string) {
    super(page, language);
  }

  private get reader() {
    return this.page.locator('[data-ng="reader"]');
  }

  private get overlay() {
    return this.page.locator('[data-ng="overlay"]');
  }

  private get sheet() {
    return this.page.locator('[data-ng="sheet"]');
  }

  private get header() {
    return this.page.locator('[data-ng="header"]');
  }

  private get headerRef() {
    return this.page.locator('[data-ng="header-ref"]');
  }

  private get stream() {
    return this.page.locator('[data-ng="stream"]');
  }

  private get associatedPanel() {
    return this.page.locator('[data-ng="panel-associated"]');
  }

  private get configPanel() {
    return this.page.locator('[data-ng="panel-config"]');
  }

  private segment(ref: string) {
    return this.page.locator(`[data-ng="segment"][data-ref="${ref}"]`);
  }

  private section(ref: string) {
    return this.page.locator(`[data-ng="section"][data-ref="${ref}"]`);
  }

  // ------------------------------------------------------------------ server HTML

  /** The page's HTML as the server sent it (no JavaScript runs), for a given User-Agent. */
  async serverHtml(url: string, userAgent: string): Promise<string> {
    const response = await this.page.request.get(url, { headers: { 'User-Agent': userAgent }, timeout: t(30000) });
    expect(response.status(), `GET ${url}`).toBe(200);
    return response.text();
  }

  // ------------------------------------------------------------------ which reader

  /** The NG tree mounted and hydrated (data-hydrated is set in its first client effect). */
  async waitForReady() {
    await expect(this.reader).toHaveAttribute('data-hydrated', 'true', { timeout: t(20000) });
  }

  async expectNgReader() {
    await this.waitForReady();
    await expect(this.page.locator('.readerApp')).toHaveCount(0);
  }

  async expectClassicReader() {
    await expect(this.page.locator('.readerApp').first()).toBeAttached({ timeout: t(20000) });
    await expect(this.reader).toHaveCount(0);
  }

  async cookie(name: string): Promise<string | null> {
    const cookies = await this.page.context().cookies();
    const found = cookies.find(c => c.name === name);
    return found ? decodeURIComponent(found.value) : null;
  }

  async expectInterface(language: 'english' | 'hebrew') {
    await expect(this.reader).toHaveAttribute('data-interface', language);
    await expect(this.reader).toHaveAttribute('dir', language === 'hebrew' ? 'rtl' : 'ltr');
  }

  // ------------------------------------------------------------------ language

  /**
   * The stream shows `language`, and a segment carries exactly the texts that language shows:
   * source only, translation only, or both.
   */
  async expectLanguage(language: NgLanguage, segmentRef: string) {
    await expect(this.stream).toHaveAttribute('data-language', language);
    const segment = this.segment(segmentRef);
    await expect(segment.locator('.ng-he')).toHaveCount(language === 'english' ? 0 : 1);
    await expect(segment.locator('.ng-en')).toHaveCount(language === 'hebrew' ? 0 : 1);
  }

  async chooseLanguage(language: NgLanguage) {
    const option = this.configPanel.locator(`[data-ng="setting-language-${language}"]`);
    await option.tap();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  }

  async expectUrlParam(name: string, value: string | null) {
    await expect.poll(() => new URL(this.page.url()).searchParams.get(name), { timeout: t(10000) }).toBe(value);
  }

  // ------------------------------------------------------------------ overlay

  async expectOverlay(type: NgOverlay) {
    await expect(this.reader).toHaveAttribute('data-overlay', type, { timeout: t(10000) });
    await expect(this.overlay).toHaveAttribute('data-state', type);
    if (type === 'none') {
      // Closed means off screen too: the slot drops the panel once its exit has finished.
      await expect(this.overlay).toBeHidden({ timeout: t(10000) });
    } else {
      await expect(this.overlay).toHaveAttribute('data-phase', 'open', { timeout: t(10000) });
    }
  }

  /** The side of the screen the open panel is anchored to ('left' | 'right'). */
  async expectPanelSide(side: 'left' | 'right') {
    await expect(this.sheet).toHaveAttribute('data-side', side);
  }

  async openConfigFromHeader() {
    await expect(this.header).toHaveAttribute('data-visible', 'true');
    await this.page.locator('[data-ng="header-settings"]').tap();
    await this.expectOverlay('config');
  }

  async closeOverlayWithButton() {
    await this.sheet.locator('[data-ng="overlay-close"]').tap();
    await this.expectOverlay('none');
  }

  async goBack() {
    await this.page.goBack({ waitUntil: 'commit' });
  }

  /** The associated panel is on `segmentRef`, showing `view` (home | category | book | ref). */
  async expectAssociatedPanel(segmentRef: string, view?: string) {
    await expect(this.associatedPanel).toHaveAttribute('data-ref', segmentRef, { timeout: t(15000) });
    if (view) {
      // A with= deep link starts on a 'filter' view that resolves once the links load.
      await expect(this.associatedPanel).toHaveAttribute('data-view', view, { timeout: t(40000) });
    }
  }

  async associatedPanelRef(): Promise<string | null> {
    return this.associatedPanel.getAttribute('data-ref');
  }

  async expectPanelTitle(title: RegExp) {
    await expect(this.associatedPanel.locator('[data-ng="panel-title"]')).toHaveText(title);
  }

  /** The book view lists at least one comment whose ref starts with `refPrefix`. */
  async expectCommentFrom(refPrefix: string) {
    await expect(this.associatedPanel.locator(`[data-ng="comment"][data-ref^="${refPrefix}"]`).first())
      .toBeVisible({ timeout: t(40000) });
  }

  // ------------------------------------------------------------------ sheets: table of contents, search

  private get sheets() {
    return this.page.locator('[data-ng="sheets"]');
  }

  private get bottomSheet() {
    return this.page.locator('[data-ng="bottom-sheet"]');
  }

  /** The header's book-and-position control (the contents icon leads it). */
  get headerTocControl() {
    return this.page.locator('[data-ng="header-toc"]');
  }

  /** A sheet is open (on screen, done moving), or none is and the slot is empty. */
  async expectSheet(type: NgSheet | 'none') {
    await expect(this.reader).toHaveAttribute('data-overlay', type, { timeout: t(10000) });
    await expect(this.sheets).toHaveAttribute('data-state', type);
    if (type === 'none') {
      await expect(this.bottomSheet).toHaveCount(0, { timeout: t(10000) });
    } else {
      await expect(this.page.locator('[data-ng="sheet-layer"]')).toHaveAttribute('data-phase', 'open', { timeout: t(10000) });
      await expect(this.bottomSheet).toHaveAttribute('data-sheet', type);
      await expect(this.bottomSheet).toHaveAttribute('role', 'dialog');
    }
  }

  /** Bring the header back (it recedes on forward scroll): a tap on the text toggles it. */
  async revealHeader() {
    if (await this.header.getAttribute('data-visible') !== 'true') {
      await this.scrollBy(-80);
      await this.scrollBy(-80);
    }
    await this.expectHeaderVisible(true);
  }

  /** Mark the document, so a later check can tell an in-app change from a page load. */
  async markDocument() {
    await this.page.evaluate(() => { (window as any).__ngDocumentMark = true; });
  }

  async expectSameDocument() {
    expect(await this.page.evaluate(() => (window as any).__ngDocumentMark === true)).toBe(true);
  }

  async openTocFromHeader() {
    await this.revealHeader();
    await this.headerTocControl.tap();
    await this.expectSheet('toc');
    await expect(this.page.locator('[data-ng="toc"]')).toHaveAttribute('data-status', 'ready', { timeout: t(30000) });
  }

  tocSection(ref: string) {
    return this.bottomSheet.locator(`[data-ng="toc-section"][data-ref="${ref}"]`);
  }

  async expectCurrentTocSection(ref: string) {
    const current = this.bottomSheet.locator('[data-ng="toc-section"][aria-current="location"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('data-ref', ref);
    await expect(current).toBeInViewport();
  }

  async chooseTocSection(ref: string) {
    await this.tocSection(ref).tap();
    await this.expectSheet('none');
    await expect(this.section(ref)).toBeAttached({ timeout: t(20000) });
  }

  async openTocTab(name: string) {
    await this.bottomSheet.locator(`[data-ng="toc-tab-${name}"]`).tap();
    await expect(this.bottomSheet.locator(`[data-ng="toc-tab-${name}"]`)).toHaveAttribute('aria-selected', 'true');
  }

  async openSearchFromHeader() {
    await this.revealHeader();
    await this.page.locator('[data-ng="header-search"]').tap();
    await this.expectSheet('search');
  }

  get searchInput() {
    return this.bottomSheet.locator('[data-ng="search-input"]');
  }

  /** Type as a person does: the sheet searches live, after a pause. */
  async searchFor(query: string) {
    await expect(this.searchInput).toBeFocused();
    await this.searchInput.pressSequentially(query, { delay: 40 });
    await expect(this.page.locator('[data-ng="search"]')).toHaveAttribute('data-status', /ready|error/, { timeout: t(30000) });
  }

  searchResult(ref: string) {
    return this.bottomSheet.locator(`[data-ng="search-result"][data-ref="${ref}"]`);
  }

  async searchResultRefs(): Promise<string[]> {
    return this.bottomSheet.locator('[data-ng="search-result"]').evaluateAll(els => els.map(el => el.getAttribute('data-ref') || ''));
  }

  async chooseSearchResult(ref: string) {
    await this.searchResult(ref).tap();
    await this.expectSheet('none');
  }

  /** A segment the reader jumped to is marked for a moment (data-flash), and on screen. */
  async expectFlashed(ref: string) {
    const segment = this.segment(ref);
    await expect(segment).toHaveAttribute('data-flash', 'true', { timeout: t(20000) });
    await expect(segment).toBeInViewport();
  }

  /** Drag the open sheet down by its grip with a finger (CDP touch; Chromium only). */
  async dragSheetDown(distance = 420) {
    const box = await this.bottomSheet.locator('.ng-bsheet-grip').boundingBox();
    expect(box).not.toBeNull();
    const from = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    await this.swipe(from, { x: from.x, y: from.y + distance }, { steps: 14, durationMs: 220 });
  }

  // ------------------------------------------------------------------ versions

  async openTranslationPicker() {
    await this.configPanel.locator('[data-ng="version-row-translation"]').tap();
    await expect(this.configPanel).toHaveAttribute('data-view', 'translation');
  }

  /** Choose a version by its versionTitle; the panel returns to its main view when the text has switched. */
  async chooseVersion(versionTitle: string) {
    const item = this.configPanel.locator(`[data-ng="version"][data-version-title="${versionTitle}"]`);
    // The picker lists versions from /api/texts/versions, fetched when it opens.
    await expect(item).toBeVisible({ timeout: t(40000) });
    await item.locator('[data-ng="version-choose"]').tap();
    await expect(this.configPanel).toHaveAttribute('data-view', 'main', { timeout: t(40000) });
  }

  async expectTranslationRow(text: RegExp) {
    await expect(this.configPanel.locator('[data-ng="version-row-translation"]')).toContainText(text);
  }

  // ------------------------------------------------------------------ pins

  async togglePin() {
    const toggle = this.associatedPanel.locator('[data-ng="pin-toggle"]');
    await expect(toggle).toBeVisible({ timeout: t(40000) });
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  }

  /** A pinned commentator shows inline under the segment, with its comments loaded. */
  async expectPinnedInline(segmentRef: string, pinKey: RegExp) {
    const pin = this.segment(segmentRef).locator('[data-ng="pinned"] [data-ng="pin"]');
    await expect(pin.first()).toHaveAttribute('data-pin-key', pinKey, { timeout: t(40000) });
    await expect(pin.first().locator('.ng-pin-comment').first()).toBeVisible({ timeout: t(40000) });
  }

  async storedPins(): Promise<string> {
    return this.page.evaluate(() => window.localStorage.getItem('ng.pinnedCommentators') || '');
  }

  // ------------------------------------------------------------------ scrolling and the header

  /** Scroll the document (the reader's scroller) by `dy` px. */
  async scrollBy(dy: number) {
    await this.page.evaluate((d) => window.scrollBy(0, d), dy);
  }

  async expectHeaderVisible(visible: boolean) {
    await expect(this.header).toHaveAttribute('data-visible', visible ? 'true' : 'false', { timeout: t(5000) });
  }

  async expectHeaderRef(ref: RegExp) {
    await expect(this.headerRef).toHaveText(ref, { timeout: t(15000) });
  }

  /** Scroll to the bottom of the stream until `sectionRef` has been appended. */
  async scrollUntilSectionLoads(sectionRef: string) {
    await expect(async () => {
      await this.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(this.section(sectionRef)).toBeAttached({ timeout: t(2000) });
    }).toPass({ timeout: t(40000) });
  }

  /** Put a segment at the middle of the viewport, where the reader takes its current position from. */
  async centerSegment(ref: string) {
    const segment = this.segment(ref);
    await expect(segment).toBeAttached({ timeout: t(15000) });
    await segment.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  }

  // ------------------------------------------------------------------ swipes (real touch input)

  private async touch(): Promise<CDPSession> {
    if (!this.cdp) { this.cdp = await this.page.context().newCDPSession(this.page); }
    return this.cdp;
  }

  async viewportWidth(): Promise<number> {
    const size = this.page.viewportSize();
    return size ? size.width : this.page.evaluate(() => window.innerWidth);
  }

  /**
   * One finger from `from` to `to`: touchStart, `steps` touchMoves over about `durationMs`,
   * touchEnd. The pacing is the gesture's speed, not a wait for state (CLAUDE.md rule 6).
   */
  async swipe(from: Point, to: Point, { steps = 16, durationMs = 260 } = {}) {
    const cdp = await this.touch();
    const at = (p: Point) => [{ x: p.x, y: p.y, id: 1, radiusX: 10, radiusY: 10, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: at({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }),
      });
      await this.page.waitForTimeout(t(durationMs / steps));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /**
   * One finger along `path` (the first point is the touchStart), `stepsPerLeg` touchMoves per
   * leg, over about `durationMs` in all, then touchEnd. For drags that wobble or turn.
   */
  async swipePath(path: Point[], { stepsPerLeg = 4, durationMs = 320 } = {}) {
    const cdp = await this.touch();
    const at = (p: Point) => [{ x: p.x, y: p.y, id: 1, radiusX: 10, radiusY: 10, force: 1 }];
    const moves = (path.length - 1) * stepsPerLeg;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(path[0]) });
    for (let leg = 1; leg < path.length; leg++) {
      const a = path[leg - 1];
      const b = path[leg];
      for (let i = 1; i <= stepsPerLeg; i++) {
        const f = i / stepsPerLeg;
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: at({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }),
        });
        await this.page.waitForTimeout(t(durationMs / moves));
      }
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /**
   * Start recording, for every touchmove, whether the reader preventDefault()ed it: the swipe's
   * axis lock. The listener is on window, in the bubble phase, so it runs after the reader's own
   * (on the document). Chromium already drops the scroll of a drag that starts sideways under
   * `touch-action: pan-y`, so page scrolling alone can't tell a locked swipe from an unlocked
   * one here; iOS Safari has no such rule, and the preventDefault is what holds the page there.
   */
  async recordTouchMoves() {
    await this.page.evaluate(() => {
      const log: { prevented: boolean; cancelable: boolean }[] = [];
      (window as any).__ngTouchMoves = log;
      window.addEventListener('touchmove', (e) => log.push({ prevented: e.defaultPrevented, cancelable: e.cancelable }),
        { passive: true });
    });
  }

  /** The recorded touchmoves: `true` for each one the reader prevented, in order. */
  async touchMovesPrevented(): Promise<boolean[]> {
    return this.page.evaluate(() => ((window as any).__ngTouchMoves || []).map((m: { prevented: boolean }) => m.prevented));
  }

  /** The document's vertical scroll position, once the frames after the last input have run. */
  async scrollY(): Promise<number> {
    return this.page.evaluate(() => new Promise<number>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY)));
    }));
  }

  /**
   * A horizontal drag across the text, well clear of the edge zones: 'leftward' goes right to
   * left, 'rightward' left to right.
   */
  async swipeAcrossText(direction: 'leftward' | 'rightward', y = 460) {
    const width = await this.viewportWidth();
    const right = width - 60;
    const left = 70;
    await this.swipe(direction === 'leftward' ? { x: right, y } : { x: left, y },
      direction === 'leftward' ? { x: left, y } : { x: right, y });
  }

  /**
   * Start recording every change to the overlay state: the reader's data-overlay and the slot's
   * data-state / data-phase / hidden. A drag that starts a panel moving sets data-phase="pulling"
   * on its first horizontal move, so an empty log means the drag never became a swipe.
   */
  async recordOverlayChanges() {
    await this.page.evaluate(() => {
      const log: string[] = [];
      (window as any).__ngOverlayLog = log;
      const observer = new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as Element;
          log.push(`${el.getAttribute('data-ng')}.${r.attributeName}=${el.getAttribute(r.attributeName!)}`);
        }
      });
      const targets = [document.querySelector('[data-ng="reader"]'), document.querySelector('[data-ng="overlay"]')];
      for (const el of targets) {
        if (el) {
          observer.observe(el, { attributes: true, attributeFilter: ['data-overlay', 'data-state', 'data-phase', 'hidden'] });
        }
      }
    });
  }

  /** The recorded overlay changes, once the frames that follow the last touch event have run. */
  async overlayChanges(): Promise<string[]> {
    return this.page.evaluate(() => new Promise<string[]>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve((window as any).__ngOverlayLog || [])));
    }));
  }
}
