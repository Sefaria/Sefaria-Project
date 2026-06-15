import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { t } from '../globals';

/**
 * Page object for the Sefaria Resource Panel (ConnectionsPanel) in the
 * **mobile single-panel layout** — i.e. `multiPanel === false`
 * (viewport width < 843px, see `static/css/breakpoints.css`).
 *
 * Source reference: static/js/ConnectionsPanel.jsx renders
 *   `<div className="connectionsPanel textList singlePanel">` and, when
 *   `!fullPanel` (mobile), renders `<ConnectionsPanelHeader>` *inside* that
 *   wrapper rather than via `ReaderControls`. So both the panel body and its
 *   header live under `.connectionsPanel.singlePanel` — no `.readerPanelBox
 *   .sidebar` wrapper exists, unlike the desktop multi-panel layout covered
 *   by `resourcePanelPage.ts`.
 *
 * Covers:
 *  - RPM-001/002/006/007: the circled-X close button added to the mobile
 *    Resources/Lexicon header (ConnectionsPanelHeader.jsx `showCloseButton`).
 *  - RPM-003/004/005: long-press-to-open-Lexicon on mobile
 *    (TextColumn.jsx `handleLongPress`/`getWordAtPoint` +
 *    ReaderPanel.jsx `setSelectedWords` → `openConnectionsInPanel`).
 */
export class MobileResourcePanelPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ============================================================
  // Element accessors
  // ============================================================

  /** Resource panel body — single-panel mobile layout. */
  private get panel(): Locator {
    return this.page.locator('.connectionsPanel.textList.singlePanel').first();
  }

  /** Panel header, rendered inside `.connectionsPanel.singlePanel` on mobile. */
  private get header(): Locator {
    return this.panel.locator('.connectionsPanelHeader').first();
  }

  /** Close (circled-X) button rendered by `<CloseButton icon="circledX" />`. */
  private get closeButton(): Locator {
    return this.header.locator('a.readerNavMenuCloseButton.circledX').first();
  }

  /** A single text segment in the main reader, located by data-ref. */
  segment(ref: string): Locator {
    return this.page.locator(`.segment[data-ref="${ref}"]`).first();
  }

  /** Generic segment selector — first visible segment in the reader. */
  private get anySegment(): Locator {
    return this.page.locator('.segment[data-ref]').first();
  }

  // ============================================================
  // High-level state predicates / waits
  // ============================================================

  /** Wait for the main reader to finish initial render and have visible segments. */
  async waitForReaderReady(): Promise<void> {
    const loading = this.page.getByRole('heading', { name: /Loading/i });
    await loading.first().waitFor({ state: 'detached', timeout: t(20000) }).catch(() => { /* not present */ });
    await expect(this.anySegment).toBeVisible({ timeout: t(20000) });
  }

  /**
   * Assert the panel's mode. `'Text'` means the connections panel is closed
   * and the reader is showing only the base text (ReaderPanel.jsx
   * `closeConnectionsInPanel` sets `mode: "Text"`).
   */
  async expectMode(mode: 'Resources' | 'Lexicon' | 'Text'): Promise<void> {
    if (mode === 'Text') {
      await expect(this.panel).toBeHidden({ timeout: t(10000) });
      return;
    }
    const modeAnchors: Record<'Resources' | 'Lexicon', string> = {
      Resources: '.topToolsButtons',
      Lexicon: '.lexicon-content, .lexicon-instructions',
    };
    await expect(this.panel.locator(modeAnchors[mode]).first()).toBeVisible({ timeout: t(15000) });
  }

  // ============================================================
  // RPM-001 / 003 / 005: opening the panel
  // ============================================================

  /** Tap a segment to open the panel in Resources mode. */
  async tapSegment(ref: string): Promise<void> {
    await this.waitForReaderReady();
    const seg = this.segment(ref);
    await seg.scrollIntoViewIfNeeded({ timeout: t(5000) }).catch(() => { /* fall through */ });
    await expect(seg).toBeVisible({ timeout: t(10000) });
    await seg.click();
    await expect(this.panel).toBeVisible({ timeout: t(15000) });
  }

  /**
   * Find the first whitespace-delimited word in a segment's Hebrew text and
   * return its on-screen center point plus its text content.
   */
  private async getFirstWordPoint(ref: string): Promise<{ x: number; y: number; text: string }> {
    const heSpan = this.page.locator(`.segment[data-ref="${ref}"] .he`).first();
    await expect(heSpan).toBeVisible({ timeout: t(10000) });
    return await heSpan.evaluate((el: HTMLElement) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let cur: Node | null;
      // eslint-disable-next-line no-cond-assign
      while ((cur = walker.nextNode())) {
        const node = cur as Text;
        const raw = node.textContent ?? '';
        if (!raw.trim()) continue;
        let i = 0;
        while (i < raw.length && /\s/.test(raw[i])) i++;
        if (i >= raw.length) continue;
        const start = i;
        while (i < raw.length && !/\s/.test(raw[i])) i++;
        const end = i;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: raw.slice(start, end) };
      }
      return { x: 0, y: 0, text: '' };
    });
  }

  /**
   * Simulate a real mobile long-press on the first Hebrew word of `ref`:
   * `touchstart` at the word's center, hold past the 500ms timer that
   * `TextColumn.handleTouchStart` starts, then `touchend`.
   *
   * Unlike the desktop long-press helper in `resourcePanelPage.ts`, this does
   * NOT touch `window.getSelection()` — `TextColumn.handleLongPress` finds
   * the word directly via `document.caretRangeFromPoint`
   * (`getWordAtPoint`), which is the whole point of the mobile rewrite.
   *
   * Returns the text of the word under the touch point.
   */
  async longPressWord(ref: string): Promise<string> {
    await this.waitForReaderReady();
    const seg = this.segment(ref);
    await seg.scrollIntoViewIfNeeded({ timeout: t(5000) }).catch(() => { /* fall through */ });
    await expect(seg).toBeVisible({ timeout: t(10000) });
    const { x, y, text } = await this.getFirstWordPoint(ref);

    await seg.evaluate((el, point: { x: number; y: number }) => {
      el.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [new Touch({ identifier: 1, target: el, clientX: point.x, clientY: point.y })],
      }));
    }, { x, y });

    // The long-press timer in TextColumn.handleTouchStart fires after 500ms.
    await this.page.waitForTimeout(t(650));

    await seg.evaluate((el) => {
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] }));
    });

    return text;
  }

  // ============================================================
  // RPM-001 / 002 / 006 / 007: circled-X close button
  // ============================================================

  async expectCloseButtonVisible(): Promise<void> {
    await expect(this.closeButton).toBeVisible({ timeout: t(5000) });
  }

  /** The close button's `href` attribute, or `null` if the attribute is absent. */
  async getCloseButtonHref(): Promise<string | null> {
    await expect(this.closeButton).toBeVisible({ timeout: t(5000) });
    return this.closeButton.getAttribute('href');
  }

  /**
   * Checks the close button's defenses against Android/iOS native long-press
   * menus:
   *  - the icon `<img>` has `pointer-events: none` (so touches land on the
   *    `<a>`, not the image — avoiding the native "open/save image" menu)
   *    and `draggable="false"`.
   *  - the `<a>` itself has its `contextmenu` event prevented.
   */
  async getCloseButtonLongPressGuards(): Promise<{ imgPointerEvents: string; imgDraggable: string | null; contextMenuPrevented: boolean }> {
    await expect(this.closeButton).toBeVisible({ timeout: t(5000) });
    const img = this.closeButton.locator('img').first();
    const imgPointerEvents = await img.evaluate((el) => getComputedStyle(el).pointerEvents);
    const imgDraggable = await img.getAttribute('draggable');
    const contextMenuPrevented = await this.closeButton.evaluate((el) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    return { imgPointerEvents, imgDraggable, contextMenuPrevented };
  }

  /** Tap the circled-X close button and assert the panel closes. */
  async tapCloseButton(): Promise<void> {
    await expect(this.closeButton).toBeVisible({ timeout: t(5000) });
    // Use a real touch tap (not `.click()`'s synthetic mouse click) — the
    // bug this guards against (Android's native long-press context menu on
    // the close button) only manifests on touch input.
    await this.closeButton.tap();
    await expect(this.panel).toBeHidden({ timeout: t(10000) });
  }

  /** Click (mouse) the circled-X close button and assert the panel closes. */
  async clickCloseButton(): Promise<void> {
    await expect(this.closeButton).toBeVisible({ timeout: t(5000) });
    await this.closeButton.click();
    await expect(this.panel).toBeHidden({ timeout: t(10000) });
  }

  /**
   * Regression check for the alignment fix
   * (`.singlePanel .connectionsPanelHeader .readerNavMenuCloseButton.circledX
   * { align-self: center }` in s2.css): the close button should sit roughly
   * vertically centered within the header, not pinned to its top edge.
   */
  async expectCloseButtonVerticallyCentered(): Promise<void> {
    const headerBox = await this.header.boundingBox();
    const btnBox = await this.closeButton.boundingBox();
    if (!headerBox || !btnBox) {
      throw new Error('Could not measure header / close button bounding boxes');
    }
    const headerMid = headerBox.y + headerBox.height / 2;
    const btnMid = btnBox.y + btnBox.height / 2;
    expect(Math.abs(headerMid - btnMid)).toBeLessThan(4);
  }

  /**
   * Regression check for the enlarged tap-target fix
   * (`.singlePanel .connectionsPanelHeader .readerNavMenuCloseButton.circledX`
   * in s2.css: `align-self: stretch` + `padding-inline-end: 15px;
   * margin-inline-end: -15px`): the close button's hit area should span the
   * full header height (covers above/below the glyph) and reach the
   * viewport's right edge (covers the area to the right of the glyph),
   * while the icon itself (`.circledX img`, 20x20) stays small and centered.
   */
  async expectCloseButtonTapTargetEnlarged(): Promise<void> {
    const headerBox = await this.header.boundingBox();
    const btnBox = await this.closeButton.boundingBox();
    const viewport = this.page.viewportSize();
    if (!headerBox || !btnBox || !viewport) {
      throw new Error('Could not measure header / close button bounding boxes / viewport');
    }
    // Tap target fills the header's height.
    expect(Math.abs(btnBox.height - headerBox.height)).toBeLessThan(2);
    // Tap target extends to the viewport's right edge.
    expect(Math.abs((btnBox.x + btnBox.width) - viewport.width)).toBeLessThan(2);
    // Tap target is meaningfully larger than the 20x20 icon it contains.
    expect(btnBox.width).toBeGreaterThan(20);
    expect(btnBox.height).toBeGreaterThan(20);
  }

  // ============================================================
  // RPM-003 / 004: Lexicon results + highlight
  // ============================================================

  async expectLexiconHasResults(): Promise<void> {
    await expect(this.panel.locator('.lexicon-results, .named-entity-wrapper').first()).toBeVisible({ timeout: t(15000) });
  }

  /**
   * Assert the long-pressed word is wrapped in `.queryTextHighlight`
   * (TextRange.jsx `addHighlights`) and rendered with the blue highlight
   * background (s2.css `#D2DCFF`).
   */
  async expectWordHighlighted(): Promise<void> {
    const highlightSpan = this.page.locator('.segment .he .queryTextHighlight').first();
    await expect(highlightSpan).toBeVisible({ timeout: t(10000) });
    await expect(highlightSpan).toHaveCSS('background-color', 'rgb(210, 220, 255)');
  }

  /**
   * Assert no segment retains keyboard focus after a long-press — i.e. the
   * `.segment:focus` light-blue background isn't left showing
   * (TextColumn.jsx `handleTouchEnd` blurs after selection).
   */
  async expectNoSegmentFocused(): Promise<void> {
    const focusedSegment = await this.page.evaluate(() =>
      !!document.activeElement?.closest('.segment')
    );
    expect(focusedSegment).toBe(false);
  }
}
