// BINDING LAYER: how story steps find the Library Assistant's surfaces (the floating
// Ask button, the panel, the header pill, the empty-search page) and measure them.
// Implementers may change any locator here; steps only call these names. See ../README.md.
//
// Everything was learned by observing production (2026-10-13), not from the
// implementation of the stories under test. Elements that don't exist yet are
// located by the most black-box anchor available (role + accessible name, copy by key)
// and, where a story names something with no role or text (the answer-ready dot, the
// chat loader), by a test id the implementation is asked to add (STATUS.md,
// "Testability requirements").
import { expect, Locator, Page } from '@playwright/test';
import { HelperBase } from '../../pages/helperBase';
import { LA_LABELS } from '../../pages/libraryAssistantPage';
import { LANGUAGES, t } from '../../globals';
import type { ChatStub } from './chatStub';
import type { Visitor } from './fixtures';

/** Test ids requested from the implementation for elements with no role or text. */
export const TEST_IDS = {
  answerReadyDot: 'la-answer-ready-dot',
  messagesLoader: 'la-messages-loader',
};

/** Searches with known result shapes on production (checked 2026-10-13 on www.sefaria.org). */
export const SEARCHES = {
  /** No results on any tab. */
  noResults: 'qqzzxxvvkk',
  /** A second query with no results anywhere, for "searches for something else". */
  otherNoResults: 'vvkkxxzzqq',
  /** Sources has results (20); Books, Authors and Topics have none. */
  someTabsEmpty: { query: 'giraffe', emptyTab: 'books' as SearchTab, resultsTab: 'sources' as SearchTab },
};

export const SEARCH_TABS = ['sources', 'books', 'authors', 'topics'] as const;
export type SearchTab = typeof SEARCH_TABS[number];

/** Chat-history button label; the Hebrew one isn't captured yet (no Hebrew history story). */
const HISTORY_LABEL: Record<string, string> = { [LANGUAGES.EN]: 'Chat history', [LANGUAGES.HE]: 'Chat history' };

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** '#7C416F' -> 'rgb(124, 65, 111)', the form getComputedStyle returns. */
export const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** One animation or transition seen on the page while a recorder ran. */
export type Motion = {
  kind: string;            // CSSAnimation | CSSTransition | Animation
  name: string;            // animation-name, or the transitioned property
  duration: number;        // ms, one iteration
  delay: number;
  iterations: number;      // -1 = infinite
  keyframes: Array<Record<string, any>>;
  inButton: boolean;       // target is the recorded element or inside it
  inDot: boolean;          // target is the answer-ready dot or inside it
  pseudo: string | null;
  target: string;
};

/** Vertical offsets (px) a keyframe list moves through, from transform / translate. */
export const translateYs = (keyframes: Array<Record<string, any>>): number[] => {
  const ys: number[] = [];
  for (const k of keyframes) {
    const tf = String(k.transform ?? '');
    let m: RegExpMatchArray | null;
    if ((m = tf.match(/translateY\(\s*(-?[\d.]+)px/))) ys.push(+m[1]);
    else if ((m = tf.match(/translate(?:3d)?\(\s*[^,]+,\s*(-?[\d.]+)px/))) ys.push(+m[1]);
    else if ((m = tf.match(/matrix\(([^)]+)\)/))) ys.push(+m[1].split(',')[5]);
    const tr = String(k.translate ?? '');
    if ((m = tr.match(/^\s*[-\d.]+px\s+(-?[\d.]+)px/))) ys.push(+m[1]);
  }
  return ys;
};

export class Assistant extends HelperBase {
  constructor(page: Page, language: string, private readonly touch = false) {
    super(page, language);
  }

  private get L() { return LA_LABELS[this.language] ?? LA_LABELS[LANGUAGES.EN]; }

  // --- The assistant ---------------------------------------------------------------

  get host() { return this.page.locator('lc-chatbot'); }

  /** The floating button that opens the assistant ("Ask"). Today's trigger pill is the same control. */
  get askButton() {
    return this.host.getByRole('button', { name: new RegExp('^' + escapeRe(this.L.openAssistant)) });
  }

  get panel() { return this.host.getByRole('dialog', { name: this.L.chatWindow }); }
  get closeButton() { return this.host.getByRole('button', { name: this.L.close, exact: true }); }
  get textBox() { return this.host.getByLabel(this.L.promptInput); }
  get sendButton() { return this.host.getByRole('button', { name: this.L.send, exact: true }); }
  get historyButton() { return this.host.getByRole('button', { name: HISTORY_LABEL[this.language], exact: true }); }
  get historyPanel() { return this.host.getByRole('complementary', { name: HISTORY_LABEL[this.language] }); }
  historyRow(title: string) { return this.historyPanel.getByRole('button', { name: new RegExp(escapeRe(title)) }).first(); }
  get messages() { return this.host.getByRole('log'); }
  message(text: string) { return this.messages.getByText(text, { exact: false }); }
  get thinking() { return this.host.locator('.thinking-content'); }
  get answerReadyDot() { return this.host.getByTestId(TEST_IDS.answerReadyDot); }
  get messagesLoader() { return this.host.getByTestId(TEST_IDS.messagesLoader); }
  /** The login prompt that replaces the text box at the free-answer limit. */
  loginPromptText(text: string) { return this.host.getByText(text); }
  loginPromptButton(name: string) { return this.host.getByRole('button', { name }); }

  /** A live region (what a screen reader would announce) containing `text`. */
  announcement(text: string) {
    return this.page
      .locator('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')
      .filter({ hasText: text });
  }

  /**
   * Whether the assistant is open, closed (Ask button showing) or absent. Waits for
   * the component to settle first, since it loads asynchronously after the page.
   */
  async state(timeout = t(10000)): Promise<'open' | 'closed' | 'absent'> {
    try {
      await expect(this.host).toBeAttached({ timeout });
      await expect(this.panel.or(this.askButton).first()).toBeVisible({ timeout });
    } catch {
      return 'absent';
    }
    return (await this.panel.isVisible()) ? 'open' : 'closed';
  }

  async press(target: Locator) {
    if (this.touch) await target.tap();
    else await target.click();
  }

  /** Open the assistant with the Ask button. Fails if there is no Ask button. */
  async open() {
    await expect(this.askButton, 'the Ask button is shown').toBeVisible({ timeout: t(10000) });
    await this.press(this.askButton);
    await expect(this.panel).toBeVisible({ timeout: t(5000) });
  }

  async close() {
    await this.press(this.closeButton);
    await expect(this.panel).toBeHidden({ timeout: t(5000) });
  }

  async ensureClosed() {
    if ((await this.state()) === 'open') await this.close();
  }

  async ensureOpen() {
    if ((await this.state()) !== 'open') await this.open();
  }

  /** Ask `text` through the text box; resolves once the (fake) server received it. */
  async ask(text: string, chat: ChatStub) {
    await this.ensureOpen();
    const before = chat.questions.length;
    await expect(this.textBox).toBeEnabled({ timeout: t(10000) });
    await this.textBox.fill(text);
    await this.textBox.press('Enter');
    await expect.poll(() => chat.questions.length, { timeout: t(10000) }).toBeGreaterThan(before);
  }

  async openHistory() {
    if ((await this.historyButton.getAttribute('aria-expanded')) !== 'true') await this.press(this.historyButton);
    await expect(this.historyPanel).toBeVisible({ timeout: t(5000) });
  }

  /** The Ask button's text, as a person reads it (ignoring the star glyph and spacing). */
  async askText(): Promise<string> {
    return normalizeLabel(await this.askButton.evaluate(el => el.textContent ?? ''));
  }

  // --- Site header -------------------------------------------------------------------

  /** The site header (not the assistant's own header, which is also a banner). */
  get siteHeader() { return this.page.getByRole('banner').filter({ has: this.page.getByRole('combobox') }).first(); }
  get headerSearchBox() { return this.siteHeader.getByRole('combobox').first(); }
  /** The phone header's hamburger button (see pages/mobileHamburgerPage.ts). */
  get mobileMenuButton() { return this.page.locator('button.menuButton').and(this.page.getByRole('button', { name: 'Menu', exact: true })); }

  /** The "✦ Library Assistant" pill in the site header, found by its label. */
  headerPill(label: string) {
    const name = new RegExp(escapeRe(label));
    return this.siteHeader.getByRole('button', { name }).or(this.siteHeader.getByRole('link', { name })).first();
  }

  /**
   * Whether the page shows a signed-in visitor: the header's profile picture on wide
   * windows, or a Log out link in the hamburger menu on phones.
   */
  async showsSignedIn(): Promise<boolean> {
    if ((this.page.viewportSize()?.width ?? 1280) >= 843) {
      return expect(this.page.locator('.header .profile-pic').first()).toBeVisible({ timeout: t(10000) }).then(() => true, () => false);
    }
    await this.press(this.mobileMenuButton);
    const logout = this.page.getByRole('navigation').locator('a.logout');
    const shown = await expect(logout).toBeVisible({ timeout: t(5000) }).then(() => true, () => false);
    await this.press(this.mobileMenuButton);
    return shown;
  }

  // --- Cookie banner -----------------------------------------------------------------

  get cookieBanner() { return this.page.locator('.cookiesNotification'); }
  get cookieBannerOk() { return this.cookieBanner.getByRole('button').filter({ visible: true }).first(); }

  // --- Search ------------------------------------------------------------------------

  searchTab(tab: SearchTab) { return this.page.getByRole('tab').nth(SEARCH_TABS.indexOf(tab)); }
  /** The empty-results block on a search tab. */
  get noResults() { return this.page.locator('.noSearchResults'); }

  /**
   * Buttons in the empty-results block itself: buttons and button-like links, not
   * the inline links inside sentences ("Report a bug", "contact us").
   */
  async noResultsButtons(): Promise<Array<{ text: string; href: string | null }>> {
    return this.noResults.first().evaluate(root =>
      Array.from(root.querySelectorAll('a, button, [role="button"]'))
        .filter(el => !el.closest('p') && (el as HTMLElement).getClientRects().length > 0)
        .map(el => ({ text: (el.textContent ?? '').trim(), href: el.getAttribute('href') })));
  }

  // --- Measuring ---------------------------------------------------------------------

  async styles(target: Locator, props: string[], pseudo?: string): Promise<Record<string, string>> {
    return target.evaluate((el, [p, ps]) => {
      const cs = getComputedStyle(el, ps as string | undefined);
      return Object.fromEntries((p as string[]).map(k => [k, cs.getPropertyValue(k)]));
    }, [props, pseudo] as const);
  }

  /** The element's box once it has stopped moving (transitions settle first). */
  async box(target: Locator) {
    let last = await target.boundingBox();
    for (let i = 0; i < 20; i++) {
      await this.page.waitForTimeout(100); // pacing between two samples of a settling box
      const b = await target.boundingBox();
      if (b && last && ['x', 'y', 'width', 'height'].every(k => Math.abs((b as any)[k] - (last as any)[k]) < 0.5)) return b;
      last = b;
    }
    if (!last) throw new Error('element has no box (not rendered)');
    return last;
  }

  /** The star beside a label: an svg/img, or a ✦ glyph. Size in px. */
  async star(target: Locator): Promise<{ kind: 'graphic' | 'glyph'; width: number; height: number; fontSize: number; x: number } | null> {
    return target.evaluate(root => {
      const all = [root, ...Array.from(root.querySelectorAll('*'))] as HTMLElement[];
      const graphic = all.find(el => /^(svg|img)$/i.test(el.tagName) && el.getClientRects().length > 0);
      if (graphic) {
        const r = graphic.getBoundingClientRect();
        return { kind: 'graphic' as const, width: r.width, height: r.height, fontSize: 0, x: r.x + r.width / 2 };
      }
      const glyph = all.find(el => Array.from(el.childNodes).some(n => n.nodeType === 3 && /[✦✧]/.test(n.textContent ?? '')));
      if (!glyph) return null;
      const r = glyph.getBoundingClientRect();
      return { kind: 'glyph' as const, width: r.width, height: r.height, fontSize: parseFloat(getComputedStyle(glyph).fontSize), x: r.x + r.width / 2 };
    });
  }

  /** Font of the element holding the visible label text (not the star). */
  async labelFont(target: Locator): Promise<{ fontSize: number; fontWeight: number; color: string; x: number }> {
    return target.evaluate(root => {
      const all = [root, ...Array.from(root.querySelectorAll('*'))] as HTMLElement[];
      const el = all.find(e => Array.from(e.childNodes).some(n => n.nodeType === 3 && (n.textContent ?? '').replace(/[✦✧\s]/g, '') !== ''));
      if (!el) throw new Error('no label text inside the element');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { fontSize: parseFloat(cs.fontSize), fontWeight: parseFloat(cs.fontWeight), color: cs.color, x: r.x + r.width / 2 };
    });
  }

  /** Whether keyboard focus is on `target` (through shadow roots). */
  async isFocused(target: Locator): Promise<boolean> {
    return target.evaluate(el => {
      let a: Element | null = document.activeElement;
      while (a && (a as any).shadowRoot?.activeElement) a = (a as any).shadowRoot.activeElement;
      return a === el;
    });
  }

  /** Press Tab until `target` has keyboard focus. */
  async tabTo(target: Locator, maxPresses = 250) {
    await expect(target).toBeVisible({ timeout: t(15000) });
    await this.page.locator('body').focus().catch(() => {});
    for (let i = 0; i < maxPresses; i++) {
      await this.page.keyboard.press('Tab');
      if (await this.isFocused(target)) return;
    }
    throw new Error(`Tab never reached the element in ${maxPresses} presses`);
  }

  /** The styles a focus indicator is drawn with. */
  async ringStyles(target: Locator): Promise<{ outline: string; boxShadow: string }> {
    const s = await this.styles(target, ['outline-style', 'outline-width', 'outline-color', 'box-shadow']);
    const drawn = s['outline-style'] !== 'none' && parseFloat(s['outline-width']) > 0 && !/rgba\(\d+, \d+, \d+, 0\)/.test(s['outline-color']);
    return { outline: drawn ? `${s['outline-style']} ${s['outline-width']} ${s['outline-color']}` : 'none', boxShadow: s['box-shadow'] || 'none' };
  }

  /**
   * Whether keyboard focus draws something the unfocused element doesn't have: an
   * outline, or a box-shadow different from its resting one. `unfocused` is
   * ringStyles() taken before focus arrived.
   */
  async focusRing(target: Locator, unfocused: { outline: string; boxShadow: string }) {
    const focused = await this.ringStyles(target);
    const visible = (focused.outline !== 'none' && focused.outline !== unfocused.outline)
      || (focused.boxShadow !== 'none' && focused.boxShadow !== unfocused.boxShadow);
    return { visible, focused, unfocused };
  }

  /**
   * Readiness for judging "no assistant here": the load event has fired and the
   * network has gone quiet (the assistant is injected by the page's scripts after
   * load). Some pages (Voices) never go fully quiet, so quiet is waited for up to a
   * bound and not required. If an <lc-chatbot> did attach, wait for it to show.
   */
  async settled() {
    await this.page.waitForLoadState('load');
    await this.page.waitForLoadState('networkidle', { timeout: t(10000) }).catch(() => { /* never fully quiet */ });
    if (await this.host.count()) await expect(this.panel.or(this.askButton).first()).toBeVisible({ timeout: t(10000) });
  }

  /** `target` never appears during `ms` (sampled continuously, not one look at the end). */
  async staysAbsent(target: Locator, ms: number): Promise<boolean> {
    const end = Date.now() + ms;
    let seen = false;
    await expect.poll(async () => {
      if (await target.count()) seen = true;
      return seen || Date.now() >= end;
    }, { intervals: [100], timeout: ms + t(5000) }).toBe(true);
    return !seen;
  }

  /** `target` stays hidden for `ms` (checked continuously), e.g. no late default-open. */
  async staysHidden(target: Locator, ms = 2000): Promise<boolean> {
    const end = Date.now() + ms;
    let seen = false;
    await expect.poll(async () => {
      if (await target.isVisible()) seen = true;
      return seen || Date.now() >= end;
    }, { intervals: [100], timeout: ms + t(5000) }).toBe(true);
    return !seen;
  }

  /**
   * Record, every frame inside the assistant, whether anything matching `selector`
   * is rendered, until text containing `untilText` is visible (or `forMs`).
   */
  async startPresenceRecorder(selector: string, untilText: string, key = 'default', forMs = 10000) {
    await this.host.evaluate((host, [sel, until, k, ms]) => {
      const w = window as any;
      w.__storyPresence = w.__storyPresence || {};
      const rec = (w.__storyPresence[k as string] = { seen: false, done: false });
      const root = (host as any).shadowRoot as ShadowRoot;
      const end = performance.now() + (ms as number);
      const sample = () => {
        const hit = Array.from(root.querySelectorAll(sel as string)).some(e => (e as HTMLElement).getClientRects().length > 0);
        if (hit) rec.seen = true;
        // Stop once the text is actually drawn (rendered, with a box, not hidden), not merely in the DOM.
        const shown = Array.from(root.querySelectorAll('*')).some(e =>
          Array.from(e.childNodes).some(n => n.nodeType === 3 && (n.textContent ?? '').includes(until as string))
          && e.getClientRects().length > 0
          && ((e as any).checkVisibility ? (e as any).checkVisibility({ visibilityProperty: true, opacityProperty: true }) : true));
        if (shown) { rec.done = true; return; }
        if (performance.now() < end) requestAnimationFrame(sample);
      };
      sample();
    }, [selector, untilText, key, forMs] as const);
  }

  /**
   * Record every text that appears in a live region (what a screen reader would
   * announce), in the page and inside the assistant, for `forMs`. Read with announcements().
   */
  async startAnnouncementRecorder(forMs = 8000) {
    await this.page.evaluate(ms => {
      const w = window as any;
      const log: string[] = (w.__storyAnnouncements = w.__storyAnnouncements || []);
      const sel = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
      const end = performance.now() + ms;
      const sample = () => {
        const roots: Array<Document | ShadowRoot> = [document];
        document.querySelectorAll('lc-chatbot').forEach(h => { if ((h as any).shadowRoot) roots.push((h as any).shadowRoot); });
        for (const r of roots) r.querySelectorAll(sel).forEach(el => {
          const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (text && !log.includes(text)) log.push(text);
        });
        if (performance.now() < end) requestAnimationFrame(sample);
      };
      sample();
    }, forMs);
  }

  async announcements(): Promise<string[]> {
    return this.page.evaluate(() => (window as any).__storyAnnouncements ?? []);
  }

  async presence(key = 'default'): Promise<{ seen: boolean; done: boolean }> {
    return this.page.evaluate(k => (window as any).__storyPresence?.[k] ?? { seen: false, done: false }, key);
  }

  /**
   * Start recording every animation and transition that runs on the page (and inside
   * the assistant's shadow root) for `forMs`, noting which ones are on `target`.
   */
  async startMotionRecorder(target: Locator, key = 'default', forMs = 6000) {
    await target.evaluate((btn, [k, ms, dotId]) => {
      const w = window as any;
      w.__storyMotion = w.__storyMotion || {};
      const log: any[] = (w.__storyMotion[k as string] = []);
      const seen = new WeakSet<Animation>();
      const roots: Array<Document | ShadowRoot> = [document];
      const r = btn.getRootNode();
      if (r instanceof ShadowRoot) roots.push(r);
      if ((btn as any).shadowRoot) roots.push((btn as any).shadowRoot);
      // "inside" across shadow boundaries (a host contains its shadow tree).
      const within = (el: Element, n: Node | null) => { while (n) { if (n === el) return true; n = n.parentNode ?? (n as any).host ?? null; } return false; };
      const end = performance.now() + (ms as number);
      const sample = () => {
        for (const root of roots) {
          for (const a of (root as any).getAnimations() as Animation[]) {
            if (seen.has(a)) continue;
            seen.add(a);
            const eff = a.effect as KeyframeEffect | null;
            const tgt = eff?.target as Element | null;
            const timing = eff?.getTiming() ?? {};
            const kf = (() => { try { return eff?.getKeyframes() ?? []; } catch { return []; } })();
            log.push({
              kind: a.constructor.name,
              name: (a as any).animationName || (a as any).transitionProperty || '',
              duration: Number(timing.duration) || 0,
              delay: Number(timing.delay) || 0,
              iterations: timing.iterations === Infinity ? -1 : Number(timing.iterations ?? 1),
              keyframes: kf.map((f: any) => ({ offset: f.computedOffset, transform: f.transform, translate: f.translate, opacity: f.opacity, width: f.width, rotate: f.rotate })),
              inButton: !!tgt && within(btn, tgt),
              inDot: !!tgt && !!(tgt as Element).closest?.(`[data-testid="${dotId}"]`),
              pseudo: eff?.pseudoElement ?? null,
              target: tgt ? `${tgt.tagName.toLowerCase()}.${String((tgt as any).className?.baseVal ?? (tgt as any).className ?? '').split(' ').join('.')}` : '',
            });
          }
        }
        if (performance.now() < end) requestAnimationFrame(sample);
      };
      sample();
    }, [key, forMs, TEST_IDS.answerReadyDot] as const);
  }

  async motion(key = 'default'): Promise<Motion[]> {
    return this.page.evaluate(k => ((window as any).__storyMotion?.[k] ?? []), key);
  }

  /**
   * Record every text the element shows, frame by frame, so a step can say a label
   * never flickered.
   */
  async startTextRecorder(target: Locator, key = 'default', forMs = 6000) {
    await target.evaluate((el, [k, ms]) => {
      const w = window as any;
      w.__storyTexts = w.__storyTexts || {};
      const log: string[] = (w.__storyTexts[k as string] = []);
      const end = performance.now() + (ms as number);
      const sample = () => {
        const text = el.isConnected ? (el.textContent ?? '') : '<removed>';
        if (log[log.length - 1] !== text) log.push(text);
        if (performance.now() < end) requestAnimationFrame(sample);
      };
      sample();
    }, [key, forMs] as const);
  }

  async texts(key = 'default'): Promise<string[]> {
    return (await this.page.evaluate(k => ((window as any).__storyTexts?.[k] ?? []), key)).map(normalizeLabel);
  }

  /** How many lines `phrase` is drawn on inside `container` (0 if the phrase isn't there). */
  async linesOf(container: Locator, phrase: string): Promise<number> {
    return container.evaluate((root, p) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const i = (node.textContent ?? '').indexOf(p);
        if (i < 0) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + p.length);
        const tops = new Set(Array.from(range.getClientRects()).filter(r => r.width > 0).map(r => Math.round(r.top)));
        return tops.size;
      }
      return 0;
    }, phrase);
  }
}

export const normalizeLabel = (s: string) => s.replace(/[✦✧]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Search for `query` the way a person does: in the header search box when there is
 * one (so the page doesn't reload), otherwise by the search URL. Waits for the tabs.
 */
export async function searchFor(visitor: Visitor, query: string, tab?: SearchTab): Promise<'in-page' | 'reloaded'> {
  const la = await visitor.la();
  let how: 'in-page' | 'reloaded' = 'in-page';
  if (await la.headerSearchBox.isVisible().catch(() => false)) {
    await la.headerSearchBox.fill(query);
    await la.headerSearchBox.press('Enter');
  } else if (await la.mobileMenuButton.isVisible().catch(() => false)) {
    // Phones: the search box lives in the hamburger menu.
    await la.press(la.mobileMenuButton);
    const box = la.page.getByRole('navigation').getByRole('combobox').first();
    await expect(box).toBeVisible({ timeout: t(5000) });
    await box.fill(query);
    await box.press('Enter');
  } else {
    await visitor.goto(visitor.libraryUrl(`/search?q=${encodeURIComponent(query)}`));
    how = 'reloaded';
  }
  await expect(la.page).toHaveURL(/\/search\?/, { timeout: t(15000) });
  await expect(la.searchTab('sources')).toBeVisible({ timeout: t(15000) });
  if (tab && tab !== 'sources') await openSearchTab(visitor, tab);
  return how;
}

export async function openSearchTab(visitor: Visitor, tab: SearchTab) {
  const la = await visitor.la();
  await la.searchTab(tab).click();
  await expect(la.searchTab(tab)).toHaveClass(/active/, { timeout: t(10000) });
}

/**
 * From the next page load on, note whether any of `texts` ever appears in an
 * empty-results block, even for a single frame (a MutationObserver installed before
 * any page script runs, so server-rendered HTML is seen too). Read with copySeen().
 */
export async function recordEmptyResultsCopy(visitor: Visitor, texts: string[]) {
  await visitor.context.addInitScript(watch => {
    const w = window as any;
    w.__storyCopySeen = [];
    const check = () => {
      document.querySelectorAll('.noSearchResults').forEach(el => {
        const text = el.textContent ?? '';
        for (const s of watch as string[]) if (text.includes(s) && !w.__storyCopySeen.includes(s)) w.__storyCopySeen.push(s);
      });
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
  }, texts);
}

export async function copySeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__storyCopySeen ?? []);
}
