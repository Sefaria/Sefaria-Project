import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { MOBILE_HAMBURGER } from '../constants';
import { assistantString, sefariaString, escapeRegExp } from '../support/assistantStrings';
import { analyzeBounces, analyzeSlide, BounceReport, RectSample, SlideReport } from '../support/motionAnalysis';

/**
 * Page object for the Library Assistant "Q4 package" behavior stories
 * (LA-BTN-*, LA-ENTRY-*, LA-PHONE-*, LA-COOKIE-*, LA-NOTE-*, LA-RTL-*).
 *
 * Written test-first: much of what it looks for (the "✦ Ask" button, the
 * full-screen phone sheet, the header pill, the answer-ready dot) does not
 * exist yet, so tests using it are expected to fail until the feature lands.
 *
 * Rules the stories set, and how this file follows them:
 *  - Find things the way a person does: by role, visible text or accessible
 *    name — never by class name, event, storage key or setting.
 *  - Read every piece of copy by its translation key (assistantString /
 *    sefariaString), never by matching English or Hebrew words.
 *  - Colors, sizes and timings are design decisions, checked with computed
 *    styles or by measuring where things are on screen.
 *
 * The existing `libraryAssistantPage.ts` covers the older UX-* stories; this
 * file is separate so the two sets of stories don't tangle.
 */

/** Design colors from the stories, in the form getComputedStyle reports them. */
const COLORS = {
  purple: 'rgb(124, 65, 111)', // #7C416F, Sefaria's mussar purple
  purpleDark: 'rgb(101, 50, 89)', // #653259, hover / pressed
  white: 'rgb(255, 255, 255)',
  handleGrey: 'rgb(204, 204, 204)', // #CCCCCC, phone sheet drag handle
  dotRed: 'rgb(192, 53, 34)', // #C03522, answer-ready dot
};

/** Allowed difference, in px, when comparing measured positions/sizes. */
const PX = 1;

/** Pause for a set time inside a touch gesture. Not wrapped in t(): the
 *  gesture's speed is part of what is being tested (a slow drag vs a quick
 *  flick), so it must not stretch with TIMEOUT_MULTIPLIER. */
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In-page helpers, installed once per page as `window.__laTest`. They walk
 * open shadow roots (the assistant renders inside `<lc-chatbot>`'s shadow
 * root) and do the per-frame measuring that has to happen inside the browser.
 * This function is serialized into the page, so it must not use anything
 * from outside its own body.
 */
function installPageHelpers(): void {
  const w = window as any;
  if (w.__laTest) return;

  const roots = (): Array<Document | ShadowRoot> => {
    const out: Array<Document | ShadowRoot> = [document];
    for (let i = 0; i < out.length; i++) {
      out[i].querySelectorAll('*').forEach((e: any) => { if (e.shadowRoot) out.push(e.shadowRoot); });
    }
    return out;
  };
  const deepAll = (selector: string): Element[] => {
    const out: Element[] = [];
    roots().forEach((r) => r.querySelectorAll(selector).forEach((e) => out.push(e)));
    return out;
  };
  const isShown = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
  };
  const labelText = (el: Element) => (el.textContent || '').replace(/✦/g, '').replace(/\s+/g, ' ').trim();
  const findAskButton = (labels: string[]): Element | null =>
    deepAll('button, [role="button"]').find((el) => isShown(el) && labels.includes(labelText(el))) || null;
  const findDialog = (name: string): Element | null =>
    deepAll('[role="dialog"]').find((el) => isShown(el) && el.getAttribute('aria-label') === name) ||
    deepAll('[role="dialog"]').find((el) => isShown(el) && (el.getRootNode() as any).host?.tagName === 'LC-CHATBOT') ||
    null;
  const px = (v: string) => parseFloat(v) || 0;
  const translation = (transform: string) => {
    const m = transform.match(/matrix\(([^)]+)\)/);
    if (!m) return { x: 0, y: 0 };
    const p = m[1].split(',').map(parseFloat);
    return { x: p[4], y: p[5] };
  };

  /** Every box painted with this background color, including ::before/::after boxes. */
  const boxesWithBackground = (scope: Document | ShadowRoot | Element, rgb: string) => {
    const out: any[] = [];
    const els: Element[] = Array.from(scope.querySelectorAll('*'));
    if (scope instanceof Element) els.unshift(scope);
    for (const el of els) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        if (cs.backgroundColor !== rgb) continue;
        const r = el.getBoundingClientRect();
        let box: { x: number; y: number; width: number; height: number };
        if (!pseudo) {
          box = { x: r.left, y: r.top, width: r.width, height: r.height };
        } else {
          // Pseudo-elements have no getBoundingClientRect; work out the box from its styles.
          const width = px(cs.width);
          const height = px(cs.height);
          let x = r.left + px(cs.marginLeft);
          let y = r.top + px(cs.marginTop);
          if (cs.position === 'absolute' || cs.position === 'fixed') {
            if (cs.left !== 'auto') x = r.left + px(cs.left);
            else if (cs.right !== 'auto') x = r.right - px(cs.right) - width;
            if (cs.top !== 'auto') y = r.top + px(cs.top);
            else if (cs.bottom !== 'auto') y = r.bottom - px(cs.bottom) - height;
          }
          const tr = translation(cs.transform);
          box = { x: x + tr.x, y: y + tr.y, width, height };
        }
        if (box.width <= 0 || box.height <= 0) continue;
        out.push({
          ...box,
          pseudo,
          borderTopLeftRadius: cs.borderTopLeftRadius,
          borderWidth: px(cs.borderTopWidth),
          borderStyle: cs.borderTopStyle,
          borderColor: cs.borderTopColor,
          boxShadow: cs.boxShadow,
        });
      }
    }
    return out;
  };

  /** The answer-ready dot: a red box touching the Ask button. */
  const findDot = (labels: string[], rgb: string) => {
    const btn = findAskButton(labels);
    if (!btn) return { button: null, dot: null, direction: 'ltr' };
    const br = btn.getBoundingClientRect();
    const near = boxesWithBackground(btn.getRootNode() as any, rgb).filter((b) =>
      b.x + b.width >= br.left - 16 && b.x <= br.right + 16 && b.y + b.height >= br.top - 16 && b.y <= br.bottom + 16);
    return {
      button: { x: br.left, y: br.top, width: br.width, height: br.height },
      dot: near[0] ?? null,
      direction: getComputedStyle(btn).direction,
    };
  };

  /** Running animations on things drawn on or right next to `anchor`. */
  const animationsNear = (anchor: Element): Animation[] => {
    const root: any = anchor.getRootNode();
    const all: Animation[] = root.getAnimations ? root.getAnimations() : document.getAnimations();
    const ar = anchor.getBoundingClientRect();
    return all.filter((a: any) => {
      const target: Element | null = a.effect?.target ?? null;
      if (!target) return false;
      const r = target.getBoundingClientRect();
      return r.right >= ar.left - 24 && r.left <= ar.right + 24 && r.bottom >= ar.top - 24 && r.top <= ar.bottom + 24;
    });
  };
  const describeAnimation = (a: any) => {
    const frames: any[] = a.effect?.getKeyframes ? a.effect.getKeyframes() : [];
    const timing = a.effect?.getComputedTiming ? a.effect.getComputedTiming() : {};
    return {
      opacities: frames.map((f) => f.opacity).filter((v) => v !== undefined).map((v) => parseFloat(v)),
      movesOrScales: frames.some((f) => f.transform !== undefined || f.translate !== undefined || f.scale !== undefined),
      duration: typeof timing.duration === 'number' ? timing.duration : 0,
      iterations: typeof timing.iterations === 'number' ? timing.iterations : 1,
    };
  };

  /** Record an element's position every animation frame for `ms` milliseconds. */
  const sample = (opts: { target: 'ask' | 'dialog'; labels: string[]; dialogName: string; ms: number; collectAnimations: boolean }) =>
    new Promise((resolve) => {
      const samples: any[] = [];
      const seen = new Set<Animation>();
      const animations: any[] = [];
      const t0 = performance.now();
      const frame = () => {
        const now = performance.now() - t0;
        const el = opts.target === 'ask' ? findAskButton(opts.labels) : findDialog(opts.dialogName);
        const r = el ? el.getBoundingClientRect() : null;
        samples.push({
          t: now,
          top: r ? r.top : null,
          bottom: r ? r.bottom : null,
          left: r ? r.left : null,
          right: r ? r.right : null,
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
        });
        if (opts.collectAnimations && el) {
          for (const a of animationsNear(el)) {
            if (!seen.has(a)) { seen.add(a); animations.push(describeAnimation(a)); }
          }
        }
        if (now < opts.ms) requestAnimationFrame(frame);
        else resolve({ samples, animations });
      };
      requestAnimationFrame(frame);
    });

  /** Scroll positions of every scrollable element of the page itself (not the assistant). */
  const pageScrollPositions = (): number[] => {
    const out = [window.scrollY];
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 1) out.push(el.scrollTop);
    });
    return out;
  };

  /** True when the top-most thing drawn at (x, y) belongs to the Library Assistant. */
  const assistantIsOnTopAt = (x: number, y: number): boolean => {
    let el: Element | null = document.elementFromPoint(x, y);
    // elementFromPoint stops at a shadow host; that host is <lc-chatbot> when the assistant is on top.
    while (el && (el as any).shadowRoot) {
      const inner = (el as any).shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    if (!el) return false;
    let node: any = el;
    while (node) {
      if (node.tagName === 'LC-CHATBOT') return true;
      node = node.parentNode || node.host;
    }
    return false;
  };

  w.__laTest = { deepAll, isShown, findAskButton, findDialog, boxesWithBackground, findDot, sample, pageScrollPositions, assistantIsOnTopAt };
}

export class LibraryAssistantQ4Page extends HelperBase {
  private touch: boolean | null = null;

  constructor(page: Page, language: string) {
    super(page, language);
  }

  // ---------------------------------------------------------------------------
  // Copy, read by translation key
  // ---------------------------------------------------------------------------

  private a(key: string): string {
    return assistantString(key, this.language);
  }

  private s(key: string): string {
    return sefariaString(key, this.language);
  }

  /** "Ask" — the floating button's label. */
  private get askLabel(): string {
    return this.a('assistant.floating_button.label');
  }

  /** "Library Assistant" — the header pill / hamburger menu item. */
  private get libraryAssistantLabel(): RegExp {
    return new RegExp(`^\\s*✦?\\s*${escapeRegExp(this.s('header.library_assistant'))}\\s*$`);
  }

  // ---------------------------------------------------------------------------
  // Element accessors
  // ---------------------------------------------------------------------------

  private get host(): Locator {
    return this.page.locator('lc-chatbot');
  }

  /** The floating "✦ Ask" button, found by its visible label. */
  private get askButton(): Locator {
    return this.page
      .getByRole('button')
      .filter({ hasText: new RegExp(`^\\s*✦?\\s*${escapeRegExp(this.askLabel)}\\s*$`) });
  }

  /** The open assistant: a floating panel on wide screens, a full-screen sheet on phones. */
  private get dialog(): Locator {
    return this.page.getByRole('dialog', { name: this.a('assistant.header.chatWindow') });
  }

  private get minimizeButton(): Locator {
    return this.dialog.getByRole('button', { name: this.a('assistant.header.close.tooltip'), exact: true });
  }

  private get moreOptionsButton(): Locator {
    // The header button comes first; saved-chat rows reuse the same name, so take the first.
    return this.dialog.getByRole('button', { name: this.a('assistant.header.moreOptions'), exact: true }).first();
  }

  private get menuItems(): Locator {
    return this.dialog.getByRole('menuitem');
  }

  private get historyButton(): Locator {
    return this.dialog.getByRole('button', { name: this.a('assistant.header.history.tooltip'), exact: true });
  }

  private get historyPanel(): Locator {
    return this.dialog.getByRole('complementary', { name: this.a('assistant.header.history.aria') });
  }

  private get conversation(): Locator {
    return this.dialog.getByRole('log', { name: this.a('assistant.messages.aria') });
  }

  private get textBox(): Locator {
    return this.dialog.getByRole('textbox', { name: this.a('assistant.input.aria') });
  }

  private get sendButton(): Locator {
    return this.dialog.getByRole('button', { name: this.a('assistant.input.send.tooltip'), exact: true });
  }

  /** Sefaria's own site header (the assistant's header is a separate `banner` inside its shadow root). */
  private get sefariaHeader(): Locator {
    return this.page.locator('div.header[role="banner"]');
  }

  /**
   * The bar you actually see. `div.header` itself is 0px tall (the bar inside it is fixed to
   * the top of the window), and Playwright counts a 0px element as hidden — so check this one.
   */
  private get sefariaHeaderBar(): Locator {
    return this.sefariaHeader.locator('.headerInner');
  }

  private get headerPill(): Locator {
    const name = this.libraryAssistantLabel;
    return this.sefariaHeader.getByRole('button', { name }).or(this.sefariaHeader.getByRole('link', { name }));
  }

  private get headerSearchBox(): Locator {
    return this.sefariaHeader.getByRole('combobox', { name: this.s('common.search_for_texts_or_keywords_here') });
  }

  private get mobileMenu(): Locator {
    return this.page.getByRole('navigation', { name: MOBILE_HAMBURGER.NAV_MENU_LABEL });
  }

  private get mobileMenuOpen(): Locator {
    return this.page.locator(MOBILE_HAMBURGER.NAV_MENU_OPEN);
  }

  private get mobileMenuItem(): Locator {
    const name = this.libraryAssistantLabel;
    return this.mobileMenu.getByRole('link', { name }).or(this.mobileMenu.getByRole('button', { name }));
  }

  private get learningSchedulesItem(): Locator {
    return this.mobileMenu.locator(`a[href="${MOBILE_HAMBURGER.HREFS.LEARNING_SCHEDULES}"]`);
  }

  /** The cookie banner has no role or label to target (see utils.hideAllModalsAndPopups). */
  private get cookieBanner(): Locator {
    return this.page.locator('.cookiesNotification');
  }

  private get cookieOkButton(): Locator {
    return this.cookieBanner.locator('[role="button"]:visible').first();
  }

  // ---------------------------------------------------------------------------
  // Small internal helpers
  // ---------------------------------------------------------------------------

  private async helpers(): Promise<void> {
    await this.page.evaluate(installPageHelpers);
  }

  private async isTouch(): Promise<boolean> {
    if (this.touch === null) {
      this.touch = await this.page.evaluate(() => navigator.maxTouchPoints > 0);
    }
    return this.touch;
  }

  /** Tap on touch devices, click everywhere else. */
  private async press(locator: Locator): Promise<void> {
    if (await this.isTouch()) await locator.tap();
    else await locator.click();
  }

  private async viewport(): Promise<{ width: number; height: number }> {
    return this.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  }

  private async box(locator: Locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error('Element has no box on screen');
    return b;
  }

  private async background(locator: Locator): Promise<string> {
    return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
  }

  /**
   * Record where `target` is on every animation frame for `ms` milliseconds.
   * Recording starts in the page first, THEN `action` runs (e.g. release an
   * answer, tap OK, lift a finger), so the very first frames of the motion are caught.
   */
  private async sampleRects(target: 'ask' | 'dialog', ms: number, action: () => Promise<void>, collectAnimations = false) {
    await this.helpers();
    await this.page.evaluate((opts) => {
      (window as any).__laSampling = (window as any).__laTest.sample(opts);
    }, { target, labels: [this.askLabel], dialogName: this.a('assistant.header.chatWindow'), ms, collectAnimations });
    await action();
    return this.page.evaluate(() => (window as any).__laSampling) as Promise<{
      samples: RectSample[];
      animations: Array<{ opacities: number[]; movesOrScales: boolean; duration: number; iterations: number }>;
    }>;
  }

  /** Size of the star beside a label: an icon's width, or the font size of a "✦" character. */
  private async starSize(locator: Locator): Promise<number | null> {
    return locator.evaluate((el) => {
      for (const icon of Array.from(el.querySelectorAll('svg, img'))) {
        const r = icon.getBoundingClientRect();
        if (r.width > 0) return r.width;
      }
      const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.textContent || '').includes('✦')) return parseFloat(getComputedStyle(node.parentElement!).fontSize);
      }
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.content && cs.content.includes('✦')) return parseFloat(cs.fontSize);
      }
      return null;
    });
  }

  /** Font size, weight and color of the text node holding `label`. */
  private async labelStyle(locator: Locator, label: string) {
    return locator.evaluate((el, text) => {
      const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.textContent || '').includes(text)) {
          const cs = getComputedStyle(node.parentElement!);
          return { fontSize: parseFloat(cs.fontSize), fontWeight: cs.fontWeight, color: cs.color };
        }
      }
      return null;
    }, label);
  }

  private async expectFullyRounded(locator: Locator): Promise<void> {
    const { radius, height } = await locator.evaluate((el) => ({
      radius: getComputedStyle(el).borderTopLeftRadius,
      height: el.getBoundingClientRect().height,
    }));
    const rounded = radius.endsWith('%') ? parseFloat(radius) >= 50 : parseFloat(radius) >= height / 2 - PX;
    expect(rounded, `corner radius ${radius} on a ${height}px-tall element should make it fully rounded`).toBe(true);
  }

  private async expectFocusRing(locator: Locator): Promise<void> {
    const ring = await locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineWidth: parseFloat(cs.outlineWidth) || 0, boxShadow: cs.boxShadow };
    });
    const visible = (ring.outlineStyle !== 'none' && ring.outlineWidth > 0) || ring.boxShadow !== 'none';
    expect(visible, `a focus ring should be visible (outline ${ring.outlineStyle} ${ring.outlineWidth}px, box-shadow ${ring.boxShadow})`).toBe(true);
  }

  /** Press Tab until `locator` has keyboard focus. */
  private async tabTo(locator: Locator, maxTabs = 80): Promise<void> {
    for (let i = 0; i < maxTabs; i++) {
      await this.page.keyboard.press('Tab');
      if (await locator.evaluate((el) => el.matches(':focus')).catch(() => false)) return;
    }
    throw new Error(`Could not reach the element with the Tab key in ${maxTabs} presses`);
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  /** The assistant is on the page and has drawn either its Ask button or its open panel/sheet. */
  async waitForReady(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.host).toHaveCount(1, { timeout: t(15000) });
    await expect(this.askButton.or(this.dialog).first()).toBeVisible({ timeout: t(15000) });
  }

  /** Close the assistant if it opened by itself, so the test starts from the Ask button. */
  async ensureClosed(): Promise<void> {
    if (await this.dialog.isVisible()) {
      await this.press(this.minimizeButton);
      await expect(this.dialog).toBeHidden({ timeout: t(5000) });
    }
    await expect(this.askButton).toBeVisible({ timeout: t(5000) });
  }

  // ---------------------------------------------------------------------------
  // Opening and closing
  // ---------------------------------------------------------------------------

  async openWithAskButton(): Promise<void> {
    await expect(this.askButton).toBeVisible({ timeout: t(5000) });
    await this.press(this.askButton);
    await this.expectAssistantOpen();
  }

  async closeWithMinimize(): Promise<void> {
    await this.press(this.minimizeButton);
    await this.expectAssistantClosed();
  }

  async expectAssistantOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible({ timeout: t(5000) });
  }

  /** Closed means: no panel/sheet, and the Ask button is back. */
  async expectAssistantClosed(): Promise<void> {
    await expect(this.dialog).toBeHidden({ timeout: t(5000) });
    await expect(this.askButton).toBeVisible({ timeout: t(5000) });
  }

  async expectAskButtonVisible(): Promise<void> {
    await expect(this.askButton).toBeVisible({ timeout: t(10000) });
  }

  async expectAskButtonHidden(): Promise<void> {
    await expect(this.askButton).toBeHidden({ timeout: t(5000) });
  }

  // ---------------------------------------------------------------------------
  // Ask button (LA-BTN-*)
  // ---------------------------------------------------------------------------

  /** LA-BTN-4: 56px tall, fully rounded, purple with white text, 16px/500 label, 18px star. */
  async expectAskButtonLook(): Promise<void> {
    const button = this.askButton;
    await expect(button).toBeVisible({ timeout: t(5000) });
    const b = await this.box(button);
    expect(Math.abs(b.height - 56), `Ask button height ${b.height}px`).toBeLessThanOrEqual(PX);
    await this.expectFullyRounded(button);
    expect(await this.background(button)).toBe(COLORS.purple);
    const label = await this.labelStyle(button, this.askLabel);
    expect(label, 'the Ask label text should be inside the button').not.toBeNull();
    expect(label!.color).toBe(COLORS.white);
    expect(label!.fontSize).toBe(16);
    expect(label!.fontWeight).toBe('500');
    expect(await this.starSize(button), 'four-point star size').toBe(18);
  }

  /** LA-BTN-5: hovering and pressing turn the button #653259. */
  async expectAskButtonHoverAndPressColor(): Promise<void> {
    await this.askButton.hover();
    await expect.poll(() => this.background(this.askButton), { timeout: t(3000) }).toBe(COLORS.purpleDark);
    await this.page.mouse.down();
    await expect.poll(() => this.background(this.askButton), { timeout: t(3000) }).toBe(COLORS.purpleDark);
    await this.page.mouse.up();
  }

  /** LA-BTN-6: on a touch screen one tap opens it, and the button never keeps the hover color. */
  async expectOneTapOpensWithoutHoverColor(): Promise<void> {
    expect(await this.background(this.askButton)).toBe(COLORS.purple);
    await this.askButton.tap();
    await this.expectAssistantOpen();
    await this.closeWithMinimize();
    // A "stuck" hover state on touch screens would leave the button dark after the tap.
    await expect.poll(() => this.background(this.askButton), { timeout: t(3000) }).toBe(COLORS.purple);
  }

  /** LA-BTN-7: keyboard focus shows a ring, and Enter opens the assistant. */
  async expectKeyboardFocusRingAndEnterOpens(): Promise<void> {
    await this.tabTo(this.askButton);
    await this.expectFocusRing(this.askButton);
    await this.page.keyboard.press('Enter');
    await this.expectAssistantOpen();
  }

  /** LA-BTN-8 / LA-BTN-9 / LA-COOKIE-4: distance from the bottom and from the given side of the window. */
  async expectAskButtonGaps(gap: number, side: 'left' | 'right' | 'either' | 'bottom only' = 'either'): Promise<void> {
    const b = await this.box(this.askButton);
    const vp = await this.viewport();
    const bottom = vp.height - (b.y + b.height);
    const left = b.x;
    const right = vp.width - (b.x + b.width);
    expect(Math.abs(bottom - gap), `gap below the Ask button is ${bottom}px`).toBeLessThanOrEqual(PX);
    if (side === 'left') expect(Math.abs(left - gap), `gap on the left is ${left}px`).toBeLessThanOrEqual(PX);
    if (side === 'right') expect(Math.abs(right - gap), `gap on the right is ${right}px`).toBeLessThanOrEqual(PX);
    if (side === 'either') {
      expect(Math.min(Math.abs(left - gap), Math.abs(right - gap)), `side gaps are ${left}px / ${right}px`).toBeLessThanOrEqual(PX);
    }
  }

  /** Side the Ask button should sit on for this interface language. */
  get endSide(): 'left' | 'right' {
    return this.language === LANGUAGES.HE ? 'left' : 'right';
  }

  /** LA-BTN-10: scroll down and back up; the button stays visible in the same place. */
  async expectAskButtonStaysPutWhileScrolling(): Promise<void> {
    const before = await this.box(this.askButton);
    const scrolledDown = await this.scrollPage(600);
    expect(scrolledDown, 'the page should actually have scrolled').toBe(true);
    await expect(this.askButton).toBeVisible();
    const middle = await this.box(this.askButton);
    await this.scrollPage(-600);
    await expect(this.askButton).toBeVisible();
    const after = await this.box(this.askButton);
    for (const b of [middle, after]) {
      expect(Math.abs(b.x - before.x)).toBeLessThanOrEqual(PX);
      expect(Math.abs(b.y - before.y)).toBeLessThanOrEqual(PX);
    }
  }

  // ---------------------------------------------------------------------------
  // Fixed entry points (LA-ENTRY-*)
  // ---------------------------------------------------------------------------

  /** LA-ENTRY-2: the pill is in the header, and the next header control after it is the search box. */
  async expectHeaderPillJustBeforeSearchBox(): Promise<void> {
    await expect(this.headerPill).toBeVisible({ timeout: t(10000) });
    await expect(this.headerSearchBox).toBeVisible({ timeout: t(10000) });
    const pill = await this.headerPill.elementHandle();
    const search = await this.headerSearchBox.elementHandle();
    const order = await this.sefariaHeader.evaluate((header, [pillEl, searchEl]) => {
      const controls = Array.from(header.querySelectorAll('a[href], button, input, [role="button"], [role="combobox"], [tabindex]'))
        .filter((el) => (el as HTMLElement).getBoundingClientRect().width > 0)
        // Count a control and the input inside it as one stop.
        .filter((el, _i, all) => !all.some((other) => other !== el && other.contains(el) && el !== searchEl));
      const pillIndex = controls.findIndex((el) => el === pillEl || el.contains(pillEl as Node));
      const searchIndex = controls.findIndex((el) => el === searchEl || el.contains(searchEl as Node));
      return { pillIndex, searchIndex };
    }, [pill, search] as const);
    expect(order.pillIndex, 'pill should be in the header').toBeGreaterThanOrEqual(0);
    expect(order.searchIndex, 'the search box should come right after the pill').toBe(order.pillIndex + 1);
  }

  async clickHeaderPill(): Promise<void> {
    await this.headerPill.click();
  }

  /** LA-ENTRY-3: tab to the pill, see a focus ring, open with the given key. */
  async openHeaderPillWithKey(key: 'Enter' | ' '): Promise<void> {
    await this.tabTo(this.headerPill);
    await this.expectFocusRing(this.headerPill);
    await this.page.keyboard.press(key === ' ' ? 'Space' : key);
    await this.expectAssistantOpen();
  }

  /** LA-ENTRY-4 */
  async expectNoHeaderPill(): Promise<void> {
    await expect(this.sefariaHeaderBar).toBeVisible({ timeout: t(15000) });
    await expect(this.headerPill).toHaveCount(0);
  }

  /** LA-ENTRY-5: 30px tall, fully rounded, purple, white 14px text, 16px star; hover/press darken it. */
  async expectHeaderPillLook(): Promise<void> {
    const pill = this.headerPill;
    await expect(pill).toBeVisible({ timeout: t(10000) });
    const b = await this.box(pill);
    expect(Math.abs(b.height - 30), `pill height ${b.height}px`).toBeLessThanOrEqual(PX);
    await this.expectFullyRounded(pill);
    expect(await this.background(pill)).toBe(COLORS.purple);
    const label = await this.labelStyle(pill, this.s('header.library_assistant'));
    expect(label, 'the pill label should be inside the pill').not.toBeNull();
    expect(label!.color).toBe(COLORS.white);
    expect(label!.fontSize).toBe(14);
    expect(await this.starSize(pill), 'star size').toBe(16);

    await pill.hover();
    await expect.poll(() => this.background(pill), { timeout: t(3000) }).toBe(COLORS.purpleDark);
    await this.page.mouse.down();
    await expect.poll(() => this.background(pill), { timeout: t(3000) }).toBe(COLORS.purpleDark);
    await this.page.mouse.up();
  }

  /** LA-ENTRY-6: in the open hamburger menu, the item sits directly above Learning Schedules. */
  async expectMenuItemDirectlyAboveLearningSchedules(): Promise<void> {
    await expect(this.mobileMenuItem).toBeVisible({ timeout: t(5000) });
    await expect(this.learningSchedulesItem).toBeVisible({ timeout: t(5000) });
    const item = await this.mobileMenuItem.elementHandle();
    const schedules = await this.learningSchedulesItem.elementHandle();
    const order = await this.mobileMenu.evaluate((menu, [itemEl, schedulesEl]) => {
      const entries = Array.from(menu.querySelectorAll('a[href], button, [role="button"]'))
        .filter((el) => (el as HTMLElement).getBoundingClientRect().width > 0);
      return {
        itemIndex: entries.indexOf(itemEl as Element),
        schedulesIndex: entries.indexOf(schedulesEl as Element),
        itemBottom: (itemEl as Element).getBoundingClientRect().bottom,
        schedulesTop: (schedulesEl as Element).getBoundingClientRect().top,
      };
    }, [item, schedules] as const);
    expect(order.itemIndex, 'Library Assistant should be the menu entry right before Learning Schedules')
      .toBe(order.schedulesIndex - 1);
    expect(order.itemBottom).toBeLessThanOrEqual(order.schedulesTop + PX);
  }

  async tapMenuItemExpectMenuClosedAndAssistantOpen(): Promise<void> {
    await this.mobileMenuItem.tap();
    await expect(this.mobileMenuOpen).toBeHidden({ timeout: t(5000) });
    await this.expectAssistantOpen();
  }

  // ---------------------------------------------------------------------------
  // Phone layout (LA-PHONE-*)
  // ---------------------------------------------------------------------------

  /** The open assistant covers the entire window, and the assistant is what's drawn at every corner. */
  async expectFullScreenSheet(): Promise<void> {
    await this.expectAssistantOpen();
    const b = await this.box(this.dialog);
    const vp = await this.viewport();
    expect(Math.abs(b.x), `sheet left ${b.x}`).toBeLessThanOrEqual(PX);
    expect(Math.abs(b.y), `sheet top ${b.y}`).toBeLessThanOrEqual(PX);
    expect(Math.abs(b.width - vp.width), `sheet width ${b.width} vs window ${vp.width}`).toBeLessThanOrEqual(PX);
    expect(Math.abs(b.height - vp.height), `sheet height ${b.height} vs window ${vp.height}`).toBeLessThanOrEqual(PX);
    await this.helpers();
    const points = [[2, 2], [vp.width - 2, 2], [2, vp.height - 2], [vp.width - 2, vp.height - 2], [vp.width / 2, vp.height / 2]];
    for (const [x, y] of points) {
      const onTop = await this.page.evaluate(([px, py]) => (window as any).__laTest.assistantIsOnTopAt(px, py), [x, y]);
      expect(onTop, `the assistant should be drawn on top at (${x}, ${y})`).toBe(true);
    }
  }

  /** The open assistant is a panel that leaves part of the page showing. */
  async expectFloatingPanel(): Promise<void> {
    await this.expectAssistantOpen();
    const b = await this.box(this.dialog);
    const vp = await this.viewport();
    const coversWindow = b.width >= vp.width - PX && b.height >= vp.height - PX;
    expect(coversWindow, `panel ${b.width}×${b.height} should be smaller than the window ${vp.width}×${vp.height}`).toBe(false);
  }

  /** LA-PHONE-2: the phone keyboard only opens when the text box has focus. */
  async expectTextBoxNotFocused(): Promise<void> {
    await expect(this.textBox).toBeVisible({ timeout: t(5000) });
    await expect(this.textBox).not.toBeFocused();
  }

  /**
   * Scroll the page with a real touch swipe (Chromium) or by scrolling the
   * page's scroll areas directly (other browsers). Returns true if anything
   * on the page (outside the assistant) actually scrolled.
   */
  async scrollPage(deltaY: number): Promise<boolean> {
    await this.helpers();
    const before: number[] = await this.page.evaluate(() => (window as any).__laTest.pageScrollPositions());
    const vp = await this.viewport();
    if (this.page.context().browser()?.browserType().name() === 'chromium') {
      const cdp = await this.page.context().newCDPSession(this.page);
      await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.round(vp.width / 2), y: Math.round(vp.height / 2), yDistance: -deltaY, gestureSourceType: 'touch', speed: 1200,
      });
      await cdp.detach();
    } else {
      await this.page.evaluate((dy) => {
        window.scrollBy(0, dy);
        document.querySelectorAll('*').forEach((el) => { if (el.scrollHeight > el.clientHeight + 1) el.scrollTop += dy; });
      }, deltaY);
    }
    const after: number[] = await this.page.evaluate(() => (window as any).__laTest.pageScrollPositions());
    return before.length !== after.length || before.some((v, i) => Math.abs(v - after[i]) > 1);
  }

  /** LA-PHONE-2: a swipe over the open sheet must not scroll the page behind it. Chromium only. */
  async expectPageBehindDoesNotScroll(): Promise<void> {
    const scrolled = await this.scrollPage(400);
    expect(scrolled, 'the page behind the sheet scrolled').toBe(false);
  }

  /**
   * Put a finger on the sheet's top bar and drag it down. Uses the Chromium
   * DevTools protocol, the only way Playwright can send touch-move events.
   * With `release: false` the finger stays down; call the returned function to lift it.
   */
  async dragTopBar(distance: number, opts: { steps: number; stepMs: number; holdMs?: number; release?: boolean }): Promise<() => Promise<void>> {
    const b = await this.box(this.dialog);
    const x = Math.round(b.x + b.width / 2);
    const y = Math.round(b.y + 12);
    const cdp = await this.page.context().newCDPSession(this.page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= opts.steps; i++) {
      await pause(opts.stepMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y + (distance * i) / opts.steps) }] });
    }
    if (opts.holdMs) await pause(opts.holdMs);
    const lift = async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
    if (opts.release !== false) await lift();
    return lift;
  }

  /** LA-PHONE-5: the four ways to close the sheet. */
  async closeSheetBy(action: 'minimize' | 'drag' | 'flick' | 'back'): Promise<void> {
    const urlBefore = this.page.url();
    if (action === 'minimize') {
      await this.press(this.minimizeButton);
    } else if (action === 'drag') {
      // Slow and long: 160px over ~0.5s, then a pause so it isn't read as a flick.
      await this.dragTopBar(160, { steps: 16, stepMs: 30, holdMs: 150 });
    } else if (action === 'flick') {
      // Short and fast: 70px in ~40ms — well under the 120px drag distance.
      await this.dragTopBar(70, { steps: 3, stepMs: 12 });
    } else {
      await this.page.goBack();
      // Back closes the sheet; it must not leave the page.
      await expect(this.page).toHaveURL(urlBefore, { timeout: t(5000) });
    }
    await this.expectAssistantClosed();
  }

  /** LA-PHONE-7: drag 60px, let go, and the sheet slides back to full screen over ~0.2s. */
  async dragShortAndMeasureSpringBack(): Promise<SlideReport> {
    const lift = await this.dragTopBar(60, { steps: 10, stepMs: 40, holdMs: 150, release: false });
    const { samples } = await this.sampleRects('dialog', 900, lift);
    return analyzeSlide(samples.filter((s) => s.top !== null).map((s) => ({ t: s.t, v: s.top as number })));
  }

  /** LA-PHONE-8: a 36 × 5px #CCCCCC bar centered at the top of the sheet. */
  async expectDragHandle(): Promise<void> {
    await this.expectAssistantOpen();
    await this.helpers();
    const sheet = await this.box(this.dialog);
    const boxes: any[] = await this.dialog.evaluate(
      (el, rgb) => (window as any).__laTest.boxesWithBackground(el, rgb),
      COLORS.handleGrey,
    );
    const handle = boxes.find((b) => Math.abs(b.width - 36) <= PX && Math.abs(b.height - 5) <= PX);
    expect(handle, `a 36×5 ${COLORS.handleGrey} bar should be in the sheet (found: ${JSON.stringify(boxes)})`).toBeTruthy();
    const handleCenter = handle.x + handle.width / 2;
    const sheetCenter = sheet.x + sheet.width / 2;
    expect(Math.abs(handleCenter - sheetCenter), 'drag handle should be centered').toBeLessThanOrEqual(PX);
    expect(handle.y - sheet.y, 'drag handle should be at the top of the sheet').toBeLessThanOrEqual(24);
  }

  /** LA-PHONE-8: while the finger is down mid-drag, the sheet's top corners are rounded 16px. */
  async expectTopCornersRoundWhileDragging(radius: number): Promise<void> {
    const lift = await this.dragTopBar(40, { steps: 5, stepMs: 30, release: false });
    try {
      const corners = await this.dialog.evaluate((el) => {
        const found: string[] = [];
        let node: any = el;
        while (node && node.nodeType === 1) {
          const cs = getComputedStyle(node);
          found.push(`${cs.borderTopLeftRadius} ${cs.borderTopRightRadius}`);
          node = node.parentNode?.host ?? node.parentNode;
        }
        return found;
      });
      expect(corners, 'the sheet (or the box around it) should have rounded top corners while dragged')
        .toContain(`${radius}px ${radius}px`);
    } finally {
      await lift();
    }
  }

  /** LA-PHONE-4 */
  async openChatHistory(): Promise<void> {
    await this.press(this.historyButton);
    await expect(this.historyPanel).toBeVisible({ timeout: t(5000) });
  }

  private async expectFillsSheet(locator: Locator, what: string): Promise<void> {
    const sheet = await this.box(this.dialog);
    const b = await this.box(locator);
    expect(Math.abs(b.width - sheet.width), `${what} width ${b.width} vs sheet ${sheet.width}`).toBeLessThanOrEqual(PX);
  }

  async expectHistoryFillsSheetAndConversationHidden(): Promise<void> {
    await expect(this.historyPanel).toBeVisible({ timeout: t(5000) });
    await this.expectFillsSheet(this.historyPanel, 'chat history');
    // On phones the history is laid over the conversation (which keeps its scroll
    // position underneath), so the conversation is covered rather than hidden, and
    // Playwright's toBeHidden() doesn't count covered as hidden.
    const panel = await this.historyPanel.elementHandle();
    await expect.poll(() => this.conversation.evaluate((log, historyEl) => {
      const r = log.getBoundingClientRect();
      const top = (log.getRootNode() as ShadowRoot).elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && !!historyEl && historyEl.contains(top);
    }, panel), { timeout: t(5000), message: 'the chat history should cover the conversation' }).toBe(true);
  }

  async pickSavedChat(title: string): Promise<void> {
    await this.press(this.historyPanel.getByRole('button', { name: new RegExp(escapeRegExp(title)) }).first());
  }

  async expectConversationFillsSheet(): Promise<void> {
    await expect(this.conversation).toBeVisible({ timeout: t(5000) });
    await this.expectFillsSheet(this.conversation, 'conversation');
    await expect(this.historyPanel).toBeHidden({ timeout: t(5000) });
  }

  /** LA-PHONE-9: buttons, menu rows, text fields and text sizes on the phone sheet. */
  async expectSizedForTouch(answerHeading: string): Promise<void> {
    // Every button at least 44 × 44.
    await this.helpers();
    const smallButtons: string[] = await this.dialog.evaluate((sheet) => {
      const t = (window as any).__laTest;
      return Array.from(sheet.querySelectorAll('button, [role="button"]'))
        .filter((el) => t.isShown(el))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 - 0.5 || r.height < 44 - 0.5)
        .map(({ el, r }) => `${el.getAttribute('aria-label') || el.textContent?.trim()} (${r.width}×${r.height})`);
    });
    expect(smallButtons, 'buttons smaller than 44×44').toEqual([]);

    // Every text field uses at least 16px text.
    const fieldSizes: number[] = await this.dialog.evaluate((sheet) =>
      Array.from(sheet.querySelectorAll('textarea, input:not([type="hidden"])'))
        .map((el) => parseFloat(getComputedStyle(el).fontSize)));
    expect(fieldSizes.length).toBeGreaterThan(0);
    for (const size of fieldSizes) expect(size, 'text field font size').toBeGreaterThanOrEqual(16);

    // One step larger than desktop: smallest text 14px, body 16px, headings 18px.
    const smallestText: number = await this.dialog.evaluate((sheet) => {
      const t = (window as any).__laTest;
      const sizes = Array.from(sheet.querySelectorAll('*'))
        .filter((el) => t.isShown(el) && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim()))
        .map((el) => parseFloat(getComputedStyle(el).fontSize));
      return Math.min(...sizes);
    });
    expect(smallestText, 'smallest text on the sheet').toBeGreaterThanOrEqual(14);

    const heading = this.conversation.getByRole('heading', { name: answerHeading });
    await expect(heading).toBeVisible({ timeout: t(5000) });
    const spacing = await heading.evaluate((h) => {
      const prev = h.previousElementSibling;
      const next = h.nextElementSibling;
      const r = h.getBoundingClientRect();
      return {
        headingSize: parseFloat(getComputedStyle(h).fontSize),
        bodySize: next ? parseFloat(getComputedStyle(next).fontSize) : NaN,
        above: prev ? r.top - prev.getBoundingClientRect().bottom : NaN,
        below: next ? next.getBoundingClientRect().top - r.bottom : NaN,
      };
    });
    expect(spacing.bodySize, 'answer body text size').toBe(16);
    expect(spacing.headingSize, 'answer heading size').toBe(18);
    expect(Math.abs(spacing.above - 16), `gap above the heading is ${spacing.above}px`).toBeLessThanOrEqual(PX);
    expect(Math.abs(spacing.below - 6), `gap below the heading is ${spacing.below}px`).toBeLessThanOrEqual(PX);

    // Menu rows at least 48px tall.
    await this.openMoreOptions();
    const rowHeights = await this.menuItems.evaluateAll((items) => items.map((i) => i.getBoundingClientRect().height));
    expect(rowHeights.length).toBeGreaterThan(0);
    for (const h of rowHeights) expect(h, 'menu row height').toBeGreaterThanOrEqual(48 - 0.5);
  }

  async openMoreOptions(): Promise<void> {
    await this.press(this.moreOptionsButton);
    await expect(this.menuItems.first()).toBeVisible({ timeout: t(5000) });
  }

  /** LA-PHONE-10: no "move to the sidebar" item in More options. */
  async expectNoSidebarOption(): Promise<void> {
    await this.openMoreOptions();
    const sidebarText = new RegExp(escapeRegExp(this.a('assistant.menu.dock')));
    await expect(this.menuItems.filter({ hasText: sidebarText })).toHaveCount(0);
    await expect(this.dialog.getByRole('menuitem', { name: sidebarText })).toHaveCount(0);
  }

  // ---------------------------------------------------------------------------
  // Asking questions
  // ---------------------------------------------------------------------------

  async askQuestion(text: string): Promise<void> {
    await this.textBox.fill(text);
    await this.press(this.sendButton);
  }

  async expectConversationContains(text: string): Promise<void> {
    await expect(this.conversation).toContainText(text, { timeout: t(15000) });
  }

  /** LA-PHONE-3: tap a link in an answer; the same tab goes to the linked page. */
  async followAnswerLink(linkText: string, expectedUrl: RegExp): Promise<void> {
    const link = this.conversation.getByRole('link', { name: linkText }).last();
    await expect(link).toBeVisible({ timeout: t(15000) });
    const tabsBefore = this.page.context().pages().length;
    await this.press(link);
    await expect(this.page).toHaveURL(expectedUrl, { timeout: t(20000) });
    expect(this.page.context().pages().length, 'the link should open in the same tab').toBe(tabsBefore);
  }

  /** LA-COOKIE-3: the text box and send button can be used (nothing covers them). */
  async expectTextBoxAndSendUsable(): Promise<void> {
    await this.textBox.click({ trial: true });
    await this.textBox.fill('Test question');
    await expect(this.sendButton).toBeEnabled({ timeout: t(3000) });
    await this.sendButton.click({ trial: true });
    await this.textBox.fill('');
  }

  // ---------------------------------------------------------------------------
  // Cookie banner (LA-COOKIE-*)
  // ---------------------------------------------------------------------------

  /**
   * Make the cookie banner show. The standard entry helpers pre-accept cookies
   * (utils.installOverlaySuppression), so remove that cookie and reload.
   * Deliberately does NOT call hideAllModalsAndPopups afterwards — that would
   * click the banner away, and the banner is what these stories are about.
   */
  async showCookieBanner(): Promise<void> {
    await this.page.context().clearCookies({ name: 'cookiesNotificationAccepted' });
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(this.host).toHaveCount(1, { timeout: t(15000) });
    await expect(this.askButton.or(this.dialog).first()).toBeVisible({ timeout: t(15000) });
    await this.ensureClosed();
    await expect(this.cookieBanner).toBeVisible({ timeout: t(10000) });
  }

  async expectCookieBannerVisible(): Promise<void> {
    await expect(this.cookieBanner).toBeVisible({ timeout: t(5000) });
  }

  async cookieBannerHeight(): Promise<number> {
    return (await this.box(this.cookieBanner)).height;
  }

  /**
   * LA-COOKIE-1: make the banner's text wrap onto more lines at the story's 393px width
   * by adding words to it, the way a longer translation or a copy edit would. At 393px
   * today's text fits on three lines, so it never wraps further on its own.
   */
  async lengthenCookieBannerText(): Promise<void> {
    await this.cookieBanner.evaluate((banner) => {
      // The banner holds one span per interface language; only the shown one has a size.
      const shown = Array.from(banner.children).find((c) => (c as HTMLElement).offsetHeight > 0) ?? banner;
      shown.insertBefore(document.createTextNode('Extra words standing in for a longer version of this message. '.repeat(3)), shown.firstChild);
    });
  }

  /**
   * LA-COOKIE-1 / LA-COOKIE-3: the Ask button's bottom edge is `gap` px above the banner's top edge.
   * The button slides into place over 0.2s (and appears at the bottom edge after the sheet
   * closes), so keep measuring until it has settled rather than reading it mid-slide.
   */
  async expectAskButtonAboveCookieBanner(gap: number): Promise<void> {
    await expect(this.askButton).toBeVisible({ timeout: t(5000) });
    let measured = NaN;
    await expect.poll(async () => {
      const banner = await this.box(this.cookieBanner);
      const button = await this.box(this.askButton);
      measured = banner.y - (button.y + button.height);
      return Math.abs(measured - gap);
    }, { timeout: t(3000), message: `the Ask button should settle ${gap}px above the cookie banner` })
      .toBeLessThanOrEqual(PX)
      .catch((e) => { throw new Error(`gap between Ask button and banner is ${measured}px\n${e.message}`); });
  }

  /** LA-COOKIE-2: tap OK and record how the Ask button moves down. */
  async acceptCookiesAndMeasureAskButtonSlide(): Promise<SlideReport> {
    const { samples } = await this.sampleRects('ask', 900, () => this.cookieOkButton.tap());
    await expect(this.cookieBanner).toBeHidden({ timeout: t(5000) });
    return analyzeSlide(samples.filter((s) => s.bottom !== null).map((s) => ({ t: s.t, v: s.innerHeight - (s.bottom as number) })));
  }

  /** LA-COOKIE-3: where the banner is, the assistant is drawn on top of it. */
  async expectAssistantOnTopOfCookieBanner(): Promise<void> {
    const banner = await this.box(this.cookieBanner);
    await this.helpers();
    const onTop = await this.page.evaluate(
      ([x, y]) => (window as any).__laTest.assistantIsOnTopAt(x, y),
      [banner.x + banner.width / 2, banner.y + banner.height / 2],
    );
    expect(onTop, 'the assistant should cover the cookie banner').toBe(true);
  }

  /** LA-COOKIE-4: on wide windows the banner is a card in a bottom corner. */
  async expectCookieBannerIsCornerCard(): Promise<void> {
    const b = await this.box(this.cookieBanner);
    const vp = await this.viewport();
    expect(b.width, 'the banner should be a card, not a full-width strip').toBeLessThan(vp.width * 0.6);
    expect(vp.height - (b.y + b.height), 'the banner should sit at the bottom').toBeLessThanOrEqual(48);
    const sideGap = Math.min(b.x, vp.width - (b.x + b.width));
    expect(sideGap, 'the banner should sit in a corner').toBeLessThanOrEqual(48);
  }

  // ---------------------------------------------------------------------------
  // Answer-ready notification (LA-NOTE-*)
  // ---------------------------------------------------------------------------

  /**
   * Record the Ask button's position (and any animations on or next to it) for
   * `ms` milliseconds, with `makeAnswerArrive` run once recording has started.
   */
  async watchAskButtonWhile(makeAnswerArrive: () => Promise<void> | void, ms = 3000) {
    const { samples, animations } = await this.sampleRects('ask', ms, async () => { await makeAnswerArrive(); }, true);
    return {
      bounces: analyzeBounces(samples) as BounceReport,
      // A "ping" is a fading animation: its opacity ends at (nearly) zero.
      pings: animations.filter((a) => a.opacities.length >= 2 && a.opacities[a.opacities.length - 1] <= 0.05 && a.opacities[0] > 0.05 && a.duration > 50),
      movingAnimations: animations.filter((a) => a.movesOrScales && a.duration > 50),
    };
  }

  private async dotInfo() {
    await this.helpers();
    return this.page.evaluate(
      ([labels, rgb]) => (window as any).__laTest.findDot(labels, rgb),
      [[this.askLabel], COLORS.dotRed] as const,
    );
  }

  async expectAnswerReadyDot(): Promise<void> {
    await expect.poll(async () => (await this.dotInfo()).dot !== null, { timeout: t(10000), message: 'a red dot should be on the Ask button' }).toBe(true);
  }

  async expectNoAnswerReadyDot(): Promise<void> {
    await expect.poll(async () => (await this.dotInfo()).dot, { timeout: t(5000), message: 'the Ask button should show no red dot' }).toBeNull();
  }

  /** LA-NOTE-2: 12px #C03522 circle, 2px white ring, at the button's top corner on the start side. */
  async expectAnswerReadyDotLook(): Promise<void> {
    const { dot, button, direction } = await this.dotInfo();
    expect(dot, 'answer-ready dot').not.toBeNull();
    // "12px circle with a 2px ring": 12px whether the ring is drawn inside it or as a shadow,
    // 16px if the ring is a border added outside the 12px circle.
    expect([12, 16].some((s) => Math.abs(dot.width - s) <= PX), `dot width ${dot.width}`).toBe(true);
    expect(Math.abs(dot.width - dot.height)).toBeLessThanOrEqual(PX);
    const radius: string = dot.borderTopLeftRadius;
    const circle = radius.endsWith('%') ? parseFloat(radius) >= 50 : parseFloat(radius) >= dot.width / 2 - PX;
    expect(circle, `dot corner radius ${radius}`).toBe(true);
    const whiteBorder = dot.borderStyle !== 'none' && Math.abs(dot.borderWidth - 2) <= 0.5 && dot.borderColor === COLORS.white;
    const whiteShadow = dot.boxShadow.includes(COLORS.white) && /\b2px\b/.test(dot.boxShadow);
    expect(whiteBorder || whiteShadow, `2px white ring (border ${dot.borderWidth}px ${dot.borderColor}, shadow ${dot.boxShadow})`).toBe(true);
    // Top corner, start side (left in English, right in Hebrew).
    const dotCenterX = dot.x + dot.width / 2;
    const dotCenterY = dot.y + dot.height / 2;
    expect(dotCenterY, 'dot should be at the top of the button').toBeLessThanOrEqual(button.y + button.height / 4);
    const startSideIsLeft = direction !== 'rtl';
    if (startSideIsLeft) expect(dotCenterX, 'dot on the start (left) side').toBeLessThanOrEqual(button.x + button.width / 4);
    else expect(dotCenterX, 'dot on the start (right) side').toBeGreaterThanOrEqual(button.x + (button.width * 3) / 4);
  }

  /** LA-NOTE-1: the screen-reader announcement is in a live region. */
  async expectAnswerReadyAnnouncement(): Promise<void> {
    const text = this.a('assistant.header.response_ready_announcement');
    const announcement = this.page.getByText(text, { exact: true });
    await expect(announcement.first()).toBeAttached({ timeout: t(10000) });
    const inLiveRegion = await announcement.first().evaluate((el) =>
      !!el.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]'));
    expect(inLiveRegion, 'the announcement should be inside a live region so screen readers read it').toBe(true);
  }

  async expectAskButtonNamedAnswerReady(): Promise<void> {
    await expect(this.askButton).toHaveAccessibleName(this.a('assistant.header.open_ready_response'), { timeout: t(10000) });
  }

  /**
   * LA-NOTE-*: ask a question, close the assistant before the answer comes back.
   * `holdAnswers` must already be on in the fake chat server.
   */
  async askThenCloseBeforeAnswer(question: string, waitForQuestion: () => Promise<void>): Promise<void> {
    await this.openWithAskButton();
    await this.askQuestion(question);
    await waitForQuestion();
    await this.closeWithMinimize();
  }
}
