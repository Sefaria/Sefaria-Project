import { expect, BrowserContext, Locator, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';

/**
 * Page object for the dark-mode theme toggle (desktop header + mobile hamburger).
 *
 * Source of truth: `static/js/ThemeToggle.jsx` (toggle UI), `static/js/sefaria/theme.js`
 * (cookie + <html data-theme>), `templates/elements/theme_head.html` (inline head script),
 * `templates/base.html` (server-rendered data-theme + theme-color meta). Contract:
 *
 *   - `<html data-theme="light|dark">` is rendered by the server from the `theme` cookie
 *     (`light` | `dark`, path `/`, parent-domain scoped: `.sefaria.org` / `.sefaria.org.il`).
 *     There is no OS-following mode: the theme is light unless the cookie is `dark`.
 *   - Desktop: `button.themeToggle` in `.header-icons`, right after the module switcher and
 *     right before the account (avatar) menu; `aria-pressed`; accessible name "Dark mode"
 *     (Hebrew "מצב כהה").
 *   - Mobile: `.mobileThemeToggle` (`role="switch"`, `aria-checked`) in
 *     `.mobileNavMenu .mobileAccountLinks`, directly after `.mobileInterfaceLanguageToggle`.
 *     Tapping it does not close the menu.
 *   - Toggling fires the analytics event `theme_toggle` and updates
 *     `<meta name="theme-color">` (dark: #181818).
 *
 * EVERY theme-related selector and constant lives in THEME_SELECTORS / THEME below, so a
 * class-name change in the feature is a one-place edit. The one exception is the tab-order
 * entry in constants.ts `SITE_CONFIGS.*.tabOrder` (constants.ts cannot import from pages/
 * without a cycle); keep it in sync with THEME_SELECTORS.DESKTOP_TOGGLE.
 */

export const THEME_SELECTORS = {
  HTML: 'html',
  /** Desktop top bar (also the mobile top bar: the same element holds whichever is mounted). */
  HEADER_INNER: '.header .headerInner',
  HEADER_ICONS: '.header .header-icons',
  DESKTOP_TOGGLE: 'button.themeToggle',
  /** Wrapper of the module switcher (9-dot) dropdown: English-stable anchor (no label text). */
  MODULE_SWITCHER: '.headerDropdownMenu[data-anl-feature_name="module_switcher"]',
  /** Account menu wrapper: avatar when logged in, the logged-out person icon otherwise. */
  ACCOUNT_MENU: '.headerDropdownMenu:has(.profile-pic), .headerDropdownMenu:has(img[src*="profile_loggedout_mdl"])',
  /** The focusable trigger inside a DropdownMenu: a <button>, or ProfilePic's tabIndex div. */
  DROPDOWN_TRIGGER: '.dropdownLinks-button > :is(button, a, [tabindex])',
  MOBILE_MENU: '.mobileNavMenu',
  MOBILE_MENU_OPEN: '.mobileNavMenu:not(.closed)',
  MOBILE_ACCOUNT_LINKS: '.mobileNavMenu .mobileAccountLinks',
  MOBILE_LANGUAGE_TOGGLE: '.mobileInterfaceLanguageToggle',
  MOBILE_TOGGLE: '.mobileThemeToggle',
  THEME_COLOR_META: 'meta[name="theme-color"]',
  /** Any theme control, used for "must not be here" checks. */
  ANY_TOGGLE: '.themeToggle, .mobileThemeToggle',
} as const;

export const THEME = {
  COOKIE: 'theme',
  ATTR: 'data-theme',
  LIGHT: 'light',
  DARK: 'dark',
  DARK_THEME_COLOR: '#181818',
  ANALYTICS_EVENT: 'theme_toggle',
  LABEL: {
    [LANGUAGES.EN]: 'Dark mode',
    [LANGUAGES.HE]: 'מצב כהה',
  } as Record<string, string>,
  /** Requests for the client bundle (render_bundle 'main'). */
  CLIENT_BUNDLE_URL: /\/static\/bundles\/client\/.+\.js(\?|$)/,
  /** Relative luminance bounds for "this surface is dark / light". #404040 ~ 0.051. */
  DARK_MAX_LUMINANCE: 0.05,
  LIGHT_MIN_LUMINANCE: 0.8,
  /** WCAG 2.x AA: body text 4.5:1, non-text UI (icons, focus rings) 3:1. */
  MIN_TEXT_CONTRAST: 4.5,
  MIN_NON_TEXT_CONTRAST: 3,
  /** WCAG 2.5.5 target size. */
  MIN_TOUCH_TARGET: 44,
  /** Pages the specs visit (paths on the module's base URL). */
  PATHS: {
    TEXTS: '/texts',
    READER: '/Genesis.1?lang=bi',
  },
  /** Cookie values that are not a theme and must render light (validated in all three layers). */
  INVALID_COOKIE_VALUES: ['purple', 'DARK'],
  /**
   * An invalid value that starts with "dark" (so a prefix match would wrongly accept it) and
   * must never be echoed into the HTML. Deliberately not a <script> payload: Cloudflare's WAF
   * answers such a cookie with a block page before it reaches Django.
   */
  UNECHOED_COOKIE_VALUE: 'dark-e2e-unechoed-7f3a',
  /** Theme is cookie-only in v1: toggling must not write the user's profile. */
  PROFILE_WRITE_URL: /\/api\/profile(\/|\?|$)/,
} as const;

/** Text selectors spot-checked for contrast. Every entry passes on the light theme today. */
export const THEME_CONTRAST_SELECTORS = {
  TEXTS_PAGE: [
    'body',
    '.header a.textLink',
    '.navBlockTitle',
    '.navBlockDescription',
    '.readerNavMenu h1',
    '.navSidebarModule h1',
    '.navSidebar a',
  ],
  READER_PAGE: [
    '.segmentText .contentSpan.primary',
    '.segmentText .contentSpan.translation',
    '.readerControls .readerTextToc',
  ],
  MOBILE_MENU: [
    '.mobileNavMenu a[href="/texts"]',
    '.mobileNavMenu .mobileInterfaceLanguageToggle a',
    '.mobileNavMenu .mobileThemeToggle',
  ],
} as const;

export type ThemeName = 'light' | 'dark';

export type PaintSample = {
  theme: string | null;
  body: string;
  html: string;
  colorScheme: string;
  at: number;
} | null;

export type ContrastResult = {
  selector: string;
  found: boolean;
  text?: string;
  fg?: string;
  bg?: string;
  bgImage?: boolean;
  ratio?: number;
};

// -----------------------------------------------------------------------------
// Context-level setup. These must run BEFORE the first navigation (i.e. before
// goToPageWithLang / goToPageWithUser), which is why they are functions on the
// context rather than page-object methods.
// -----------------------------------------------------------------------------

const isHostOnly = (host: string) =>
  host === 'localhost' || host.endsWith('.localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

/**
 * The domain the app writes the `theme` cookie on: the parent of the language's
 * hostnames (`www.sefaria.org` -> `.sefaria.org`, `www.x.cauldron.sefaria.org` ->
 * `.x.cauldron.sefaria.org`), mirroring `Sefaria.util.getCookieDomain()`.
 * `null` means host-only (localhost / IP, where the app sets no domain).
 */
export function themeCookieDomain(url: string): string | null {
  const host = new URL(url).hostname;
  if (isHostOnly(host)) return null;
  const parts = host.split('.');
  return parts.length >= 3 ? '.' + parts.slice(1).join('.') : '.' + host;
}

/** Seed the `theme` cookie (any raw value, to test invalid ones too) before navigation. */
export async function seedThemeCookie(context: BrowserContext, url: string, value: string) {
  const domain = themeCookieDomain(url);
  const u = new URL(url);
  await context.addCookies([
    domain
      ? { name: THEME.COOKIE, value, domain, path: '/', secure: u.protocol === 'https:', sameSite: 'Lax' as const, expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }
      : { name: THEME.COOKIE, value, url: u.origin, sameSite: 'Lax' as const, expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
  ]);
}

/**
 * Record the page background at DOMContentLoaded and at the first animation frame in
 * which <body> exists. rAF callbacks do not run while render-blocking stylesheets are
 * pending, so the rAF sample is what the first painted frame looks like. Runs on every
 * document the context loads (reloads included). Read back with `getPaintSamples()`.
 */
export async function installPaintProbe(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as any;
    w.__themePaintProbe = { dcl: null, raf: null };
    const read = () => {
      if (!document.body) return null;
      const root = document.documentElement;
      return {
        theme: root.getAttribute('data-theme'),
        body: getComputedStyle(document.body).backgroundColor,
        html: getComputedStyle(root).backgroundColor,
        colorScheme: getComputedStyle(root).colorScheme,
        at: performance.now(),
      };
    };
    document.addEventListener('DOMContentLoaded', () => { w.__themePaintProbe.dcl = read(); }, { once: true });
    const tick = () => {
      const sample = read();
      if (sample) w.__themePaintProbe.raf = sample;
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Make `gtag('event', …)` observable whether or not the sandbox configures GA: define
 * `dataLayer` and a queueing `gtag` stub before any page script. base.html's own
 * `function gtag(){dataLayer.push(arguments)}` (when GOOGLE_GTAG is set) replaces the
 * stub with an identical one and keeps pushing into the same array.
 */
export async function installAnalyticsCapture(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    if (typeof w.gtag !== 'function') {
      w.gtag = function () { w.dataLayer.push(arguments); };
    }
  });
}

/**
 * Abort every client-bundle request, so only the server-rendered attribute and the
 * inline head script can set the theme. Returns a live counter: assert it is > 0 so the
 * test cannot pass because the pattern silently stopped matching.
 */
export async function blockClientBundle(context: BrowserContext): Promise<{ blocked: string[] }> {
  const state = { blocked: [] as string[] };
  await context.route(THEME.CLIENT_BUNDLE_URL, async (route) => {
    state.blocked.push(route.request().url());
    await route.abort();
  });
  return state;
}

// -----------------------------------------------------------------------------
// In-page helpers (serialised into page.evaluate; keep them self-contained)
// -----------------------------------------------------------------------------

function rgbaOf(color: string): number[] | null {
  const m = /rgba?\(([^)]+)\)/.exec(color || '');
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  return p.length > 3 ? p : [...p, 1];
}

/** WCAG relative luminance of an opaque CSS rgb()/rgba() string (alpha ignored). */
function luminanceOf(color: string): number | null {
  const p = rgbaOf(color);
  if (!p) return null;
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
}

/** What is painted behind the page: body bg, else <html> bg, else the canvas. */
function visiblePageBackground(s: { body: string; html: string; colorScheme: string }): { color: string; source: string } {
  const opaque = (c: string) => { const p = rgbaOf(c); return !!p && p[3] >= 1; };
  if (opaque(s.body)) return { color: s.body, source: 'body' };
  if (opaque(s.html)) return { color: s.html, source: 'html' };
  // Chromium's dark canvas is #121212; light canvas is white.
  return { color: /dark/.test(s.colorScheme || '') ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)', source: 'canvas' };
}

function classifyBackground(color: string): string {
  const L = luminanceOf(color);
  if (L === null) return 'unknown';
  if (L <= THEME.DARK_MAX_LUMINANCE) return THEME.DARK;
  if (L >= THEME.LIGHT_MIN_LUMINANCE) return THEME.LIGHT;
  return 'mid-tone';
}

/**
 * Contrast of each selector's first visible match against its effective background
 * (ancestor background colors composited down to an opaque one, or the canvas: #121212
 * under `color-scheme: dark`, white otherwise). Background images are ignored but flagged.
 * Text mode: the element needs text and is measured by its `color`. Glyph mode (icon-only
 * controls): measured by its inline SVG's fill (or stroke), falling back to `color`.
 */
function contrastInPage({ selectors, glyph }: { selectors: readonly string[]; glyph: boolean }) {
  type C = { r: number; g: number; b: number; a: number };
  const parse = (c: string): C | null => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg: C, bg: C): C => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const lum = (c: C) => {
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const canvas = (): C => (/dark/.test(getComputedStyle(document.documentElement).colorScheme || '')
    ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 });
  const effectiveBg = (el: Element) => {
    const layers: C[] = [];
    let image = false;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') image = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg: C = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop()! : canvas();
    while (layers.length) bg = over(layers.pop()!, bg);
    return { bg, image };
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
  };
  const fmt = (c: C) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  return selectors.map((selector) => {
    const el = Array.from(document.querySelectorAll(selector))
      .find((e) => e === document.body || (visible(e) && (glyph || (e.textContent || '').trim().length > 0)));
    if (!el) return { selector, found: false };
    const { bg, image } = effectiveBg(el);
    let fgRaw = parse(getComputedStyle(el).color);
    if (glyph) {
      const svg = el.querySelector('svg');
      const paint = svg ? [getComputedStyle(svg).fill, getComputedStyle(svg).stroke].map(parse).find((c) => c && c.a > 0) : null;
      if (paint) fgRaw = paint;
    }
    if (!fgRaw) return { selector, found: false };
    const fg = over(fgRaw, bg);
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return {
      selector, found: true, text: (el.textContent || '').trim().slice(0, 40),
      fg: fmt(fg), bg: fmt(bg), bgImage: image, ratio: Math.round(ratio * 100) / 100,
    };
  });
}

// -----------------------------------------------------------------------------
// Page object
// -----------------------------------------------------------------------------

export class ThemeTogglePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- locators --------------------------------------------------------------

  private get html(): Locator {
    return this.page.locator(THEME_SELECTORS.HTML);
  }

  private get headerIcons(): Locator {
    return this.page.locator(THEME_SELECTORS.HEADER_ICONS);
  }

  /** The desktop toggle, anchored on BOTH the contract class and its role + name. */
  private get desktopToggle(): Locator {
    return this.headerIcons.locator(THEME_SELECTORS.DESKTOP_TOGGLE).and(
      this.page.getByRole('button', { name: this.label, exact: true }),
    );
  }

  private get moduleSwitcherButton(): Locator {
    return this.headerIcons.locator(THEME_SELECTORS.MODULE_SWITCHER).locator(THEME_SELECTORS.DROPDOWN_TRIGGER).first();
  }

  private get accountMenuButton(): Locator {
    return this.headerIcons.locator(THEME_SELECTORS.ACCOUNT_MENU).locator(THEME_SELECTORS.DROPDOWN_TRIGGER).first();
  }

  private get mobileMenuOpen(): Locator {
    return this.page.locator(THEME_SELECTORS.MOBILE_MENU_OPEN);
  }

  /** The mobile switch, anchored on BOTH the contract class and its role + name. */
  private get mobileToggle(): Locator {
    return this.page.locator(`${THEME_SELECTORS.MOBILE_ACCOUNT_LINKS} ${THEME_SELECTORS.MOBILE_TOGGLE}`).and(
      this.page.getByRole('switch', { name: this.label }),
    );
  }

  private get themeColorMeta(): Locator {
    return this.page.locator(THEME_SELECTORS.THEME_COLOR_META);
  }

  /** Accessible name of the toggle in the current interface language. */
  get label(): string {
    return THEME.LABEL[this.language] ?? THEME.LABEL[LANGUAGES.EN];
  }

  // --- navigation ------------------------------------------------------------

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(this.page);
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(this.page);
  }

  // --- theme state -------------------------------------------------------------

  async expectTheme(theme: ThemeName): Promise<void> {
    await expect(this.html, `<html ${THEME.ATTR}>`).toHaveAttribute(THEME.ATTR, theme, { timeout: t(10000) });
    await this.expectPageBackground(theme);
  }

  /**
   * What the user sees behind the page: body background, else <html> background, else
   * the canvas (dark only under `color-scheme: dark`). Dark must be below #404040
   * luminance, light above ~#e6e6e6.
   */
  async expectPageBackground(theme: ThemeName): Promise<void> {
    await expect.poll(async () => this.effectivePageBackground(), {
      timeout: t(10000),
      message: `page background should be ${theme}`,
    }).toEqual(expect.objectContaining({ kind: theme }));
  }

  private async effectivePageBackground(): Promise<{ kind: string; color: string; source: string }> {
    const sample = await this.page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      html: getComputedStyle(document.documentElement).backgroundColor,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    const bg = visiblePageBackground(sample);
    return { kind: classifyBackground(bg.color), ...bg };
  }

  /** Remove every `theme` cookie (then reload to see the default). */
  async clearThemeCookie(): Promise<void> {
    await this.page.context().clearCookies({ name: THEME.COOKIE });
  }

  async emulateOsDarkPreference(): Promise<void> {
    await this.page.emulateMedia({ colorScheme: 'dark' });
  }

  /** The served HTML must not echo a raw cookie value (e.g. an injected script). */
  async expectMarkupExcludes(text: string): Promise<void> {
    expect((await this.page.content()).includes(text), `page markup contains ${JSON.stringify(text)}`).toBe(false);
  }

  /**
   * Start counting full document loads. Returns a getter so a test can assert that
   * toggling the theme is instant (no reload, no server round-trip for the page).
   */
  trackDocumentLoads(): () => number {
    let count = 0;
    this.page.on('domcontentloaded', () => { count++; });
    return () => count;
  }

  /** Start recording non-GET requests to /api/profile. Returns a getter for the URLs. */
  trackProfileWrites(): () => string[] {
    const writes: string[] = [];
    this.page.on('request', (req) => {
      if (req.method() !== 'GET' && THEME.PROFILE_WRITE_URL.test(req.url())) writes.push(`${req.method()} ${req.url()}`);
    });
    return () => [...writes];
  }

  async getThemeColor(): Promise<string | null> {
    return this.themeColorMeta.first().getAttribute('content');
  }

  async expectThemeColor(value: string): Promise<void> {
    await expect(this.themeColorMeta).toHaveCount(1);
    await expect(this.themeColorMeta).toHaveAttribute('content', new RegExp(`^${value}$`, 'i'), { timeout: t(5000) });
  }

  /**
   * Exactly one `theme` cookie, on the app's cookie domain, path `/`, persistent
   * (at least a year). `null` asserts there is no `theme` cookie at all.
   */
  async expectThemeCookie(value: ThemeName | null): Promise<void> {
    const url = this.page.url();
    const domain = themeCookieDomain(url) ?? new URL(url).hostname;
    const describe = async () => (await this.page.context().cookies())
      .filter((c) => c.name === THEME.COOKIE)
      .map((c) => ({
        value: c.value,
        domain: c.domain,
        path: c.path,
        persistent: c.expires > Date.now() / 1000 + 60 * 60 * 24 * 365,
      }));
    if (value === null) {
      await expect.poll(describe, { timeout: t(5000), message: 'no theme cookie expected' }).toEqual([]);
      return;
    }
    await expect.poll(describe, { timeout: t(5000), message: `one ${THEME.COOKIE}=${value} cookie on ${domain}` })
      .toEqual([{ value, domain, path: '/', persistent: true }]);
  }

  async expectPrefersDarkEmulated(): Promise<void> {
    expect(await this.page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  }

  // --- no-flash ---------------------------------------------------------------

  async getPaintSamples(): Promise<{ dcl: PaintSample; raf: PaintSample }> {
    await expect.poll(() => this.page.evaluate(() => {
      const p = (window as any).__themePaintProbe;
      return !!(p && p.dcl && p.raf);
    }), { timeout: t(15000), message: 'paint probe (installPaintProbe) never recorded both samples' }).toBe(true);
    return this.page.evaluate(() => (window as any).__themePaintProbe);
  }

  /** Both the DOMContentLoaded sample and the first-frame sample already show `theme`. */
  async expectNoFlash(theme: ThemeName): Promise<void> {
    const { dcl, raf } = await this.getPaintSamples();
    for (const [when, sample] of [['DOMContentLoaded', dcl], ['first animation frame', raf]] as const) {
      expect(sample!.theme, `data-theme at ${when}`).toBe(theme);
      const bg = visiblePageBackground(sample!);
      expect(classifyBackground(bg.color), `page background at ${when}: ${JSON.stringify({ ...sample, painted: bg })}`).toBe(theme);
    }
  }

  // --- analytics -------------------------------------------------------------

  /** Params of every `gtag('event', 'theme_toggle', params)` seen so far (installAnalyticsCapture). */
  async getThemeToggleEvents(): Promise<Record<string, unknown>[]> {
    return this.page.evaluate((name) => {
      const dl = ((window as any).dataLayer || []) as any[];
      return dl
        .filter((e) => e && typeof e === 'object' && e.length >= 2 && e[0] === 'event' && e[1] === name)
        .map((e) => JSON.parse(JSON.stringify(e[2] ?? {})));
    }, THEME.ANALYTICS_EVENT);
  }

  async expectThemeToggleEventCount(count: number): Promise<void> {
    await expect.poll(async () => (await this.getThemeToggleEvents()).length, {
      timeout: t(5000),
      message: `${THEME.ANALYTICS_EVENT} analytics events`,
    }).toBe(count);
  }

  // --- desktop toggle ---------------------------------------------------------

  async expectDesktopToggleVisible(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.desktopToggle).toBeVisible({ timeout: t(15000) });
    await expect(this.desktopToggle).toBeInViewport();
    await expect(this.desktopToggle).toHaveAttribute('type', 'button');
    await expect(this.desktopToggle).toBeEnabled();
  }

  /**
   * `.header-icons` child order: [... module switcher][toggle][account menu], and the same
   * order on screen (left-to-right in LTR, right-to-left in RTL), so a CSS `order` or
   * absolute positioning cannot silently move it.
   */
  async expectDesktopTogglePlacement(): Promise<void> {
    await this.expectDesktopToggleVisible();
    const placement = await this.page.evaluate((sel) => {
      const root = document.querySelector(sel.HEADER_ICONS);
      if (!root) return { error: 'no .header-icons' };
      const kids = Array.from(root.children);
      const idx = (s: string) => kids.findIndex((k) => k.matches(s) || !!k.querySelector(s));
      const box = (i: number) => (i < 0 ? null : kids[i].getBoundingClientRect());
      const toggle = idx(sel.DESKTOP_TOGGLE);
      const moduleSwitcher = idx(sel.MODULE_SWITCHER);
      const account = idx(sel.ACCOUNT_MENU);
      const [bt, bm, ba] = [box(toggle), box(moduleSwitcher), box(account)];
      return {
        toggle, moduleSwitcher, account,
        rtl: getComputedStyle(root).direction === 'rtl',
        x: bt && bm && ba ? { moduleSwitcher: bm.left + bm.width / 2, toggle: bt.left + bt.width / 2, account: ba.left + ba.width / 2 } : null,
      };
    }, THEME_SELECTORS);
    expect(placement, JSON.stringify(placement)).not.toHaveProperty('error');
    const p = placement as { toggle: number; moduleSwitcher: number; account: number; rtl: boolean; x: { moduleSwitcher: number; toggle: number; account: number } | null };
    expect(p.moduleSwitcher, 'module switcher present in .header-icons').toBeGreaterThanOrEqual(0);
    expect(p.account, 'account menu present in .header-icons').toBeGreaterThanOrEqual(0);
    expect(p.toggle, 'toggle is the element right after the module switcher').toBe(p.moduleSwitcher + 1);
    expect(p.account, 'account menu is the element right after the toggle').toBe(p.toggle + 1);
    expect(p.x, 'bounding boxes').not.toBeNull();
    const dir = p.rtl ? -1 : 1;
    expect(dir * (p.x!.toggle - p.x!.moduleSwitcher), 'toggle is drawn after the module switcher').toBeGreaterThan(0);
    expect(dir * (p.x!.account - p.x!.toggle), 'account menu is drawn after the toggle').toBeGreaterThan(0);
  }

  async clickDesktopToggle(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.desktopToggle).toBeVisible({ timeout: t(10000) });
    await this.desktopToggle.click();
  }

  async expectDesktopPressed(pressed: boolean): Promise<void> {
    await expect(this.desktopToggle).toHaveAttribute('aria-pressed', String(pressed), { timeout: t(5000) });
    // WAI-ARIA toggle button: the label stays constant, only aria-pressed changes.
    await expect(this.desktopToggle).toHaveAccessibleName(this.label);
  }

  /** Toggle via the UI and wait for the resulting state, whichever way it goes. */
  async toggleDesktopTo(theme: ThemeName): Promise<void> {
    await this.clickDesktopToggle();
    await this.expectDesktopPressed(theme === THEME.DARK);
    await this.expectTheme(theme);
  }

  // --- keyboard ---------------------------------------------------------------

  async focusModuleSwitcher(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.moduleSwitcherButton).toBeVisible({ timeout: t(10000) });
    await this.moduleSwitcherButton.focus();
    await expect(this.moduleSwitcherButton).toBeFocused();
  }

  async focusAccountMenu(): Promise<void> {
    await expect(this.accountMenuButton).toBeVisible({ timeout: t(10000) });
    await this.accountMenuButton.focus();
    await expect(this.accountMenuButton).toBeFocused();
  }

  async expectAccountMenuFocused(): Promise<void> {
    await expect(this.accountMenuButton).toBeFocused({ timeout: t(5000) });
  }

  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async expectDesktopToggleFocused(): Promise<void> {
    await expect(this.desktopToggle).toBeFocused({ timeout: t(5000) });
  }

  /** A keyboard user can see where focus is: an outline or a box-shadow ring. */
  async expectDesktopFocusIndicatorVisible(): Promise<void> {
    const ring = await this.desktopToggle.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        tabbing: document.body.classList.contains('user-is-tabbing'),
        outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
        shadow: cs.boxShadow !== 'none',
        detail: `outline: ${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}; box-shadow: ${cs.boxShadow}`,
      };
    });
    expect(ring.tabbing, 'body.user-is-tabbing after a Tab key press').toBe(true);
    expect(ring.outline || ring.shadow, `visible focus ring on the toggle (${ring.detail})`).toBe(true);
  }

  // --- mobile toggle ----------------------------------------------------------

  async expectMobileToggleVisible(): Promise<void> {
    await expect(this.mobileMenuOpen).toBeVisible({ timeout: t(5000) });
    await expect(this.mobileToggle).toBeVisible({ timeout: t(10000) });
    await this.mobileToggle.scrollIntoViewIfNeeded();
    await expect(this.mobileToggle).toBeInViewport();
  }

  /** Directly after the interface-language row inside `.mobileAccountLinks`, on screen too. */
  async expectMobileTogglePlacement(): Promise<void> {
    await this.expectMobileToggleVisible();
    const placement = await this.page.evaluate((sel) => {
      const links = document.querySelector(sel.MOBILE_ACCOUNT_LINKS);
      const toggle = links && links.querySelector(sel.MOBILE_TOGGLE);
      if (!links || !toggle) return { error: 'toggle not inside .mobileAccountLinks' };
      let row: Element = toggle;
      while (row.parentElement && row.parentElement !== links) row = row.parentElement;
      const prev = row.previousElementSibling;
      const lang = links.querySelector(sel.MOBILE_LANGUAGE_TOGGLE);
      return {
        previousIsLanguageToggle: !!prev && (prev.matches(sel.MOBILE_LANGUAGE_TOGGLE) || !!prev.querySelector(sel.MOBILE_LANGUAGE_TOGGLE)),
        previous: prev ? `${prev.tagName.toLowerCase()}.${Array.from(prev.classList).join('.')}` : null,
        belowLanguageRow: !!lang && row.getBoundingClientRect().top >= lang.getBoundingClientRect().bottom - 1,
      };
    }, THEME_SELECTORS);
    expect(placement, JSON.stringify(placement)).not.toHaveProperty('error');
    expect(placement, JSON.stringify(placement)).toEqual(expect.objectContaining({ previousIsLanguageToggle: true, belowLanguageRow: true }));
  }

  async expectMobileTouchTarget(): Promise<void> {
    const box = await this.mobileToggle.boundingBox();
    expect(box, 'toggle bounding box').not.toBeNull();
    expect(box!.height, 'touch target height').toBeGreaterThanOrEqual(THEME.MIN_TOUCH_TARGET);
    expect(box!.width, 'touch target width').toBeGreaterThanOrEqual(THEME.MIN_TOUCH_TARGET);
  }

  async tapMobileToggle(): Promise<void> {
    await expect(this.mobileToggle).toBeVisible({ timeout: t(10000) });
    await this.mobileToggle.scrollIntoViewIfNeeded();
    await this.mobileToggle.tap();
  }

  async expectMobileChecked(checked: boolean): Promise<void> {
    await expect(this.mobileToggle).toHaveAttribute('aria-checked', String(checked), { timeout: t(5000) });
    await expect(this.mobileToggle).toHaveAccessibleName(this.label);
  }

  async expectMobileMenuStillOpen(): Promise<void> {
    await expect(this.mobileMenuOpen).toBeVisible({ timeout: t(5000) });
    // and it stays open (no delayed close from a bubbling onClick)
    await this.page.waitForTimeout(t(500));
    await expect(this.mobileMenuOpen).toBeVisible();
    await expect(this.mobileToggle).toBeVisible();
  }

  async toggleMobileTo(theme: ThemeName): Promise<void> {
    await this.tapMobileToggle();
    await this.expectMobileChecked(theme === THEME.DARK);
    await this.expectTheme(theme);
  }

  /**
   * With the hamburger closed, no theme control is visible anywhere: not in the mobile
   * top bar, and the desktop `button.themeToggle` (which SSR renders, since the server
   * always renders the desktop header) is gone after the client mounts the mobile header.
   */
  async expectNoToggleOutsideMobileMenu(): Promise<void> {
    await expect(this.page.locator(THEME_SELECTORS.MOBILE_MENU_OPEN)).toHaveCount(0);
    await expect(this.page.getByRole('button', { name: this.label, exact: true })).toHaveCount(0, { timeout: t(10000) });
    await expect(this.page.getByRole('switch', { name: this.label })).toHaveCount(0);
    await expect(this.page.locator(THEME_SELECTORS.HEADER_INNER).locator(THEME_SELECTORS.ANY_TOGGLE)).toHaveCount(0);
    await expect(this.page.locator(THEME_SELECTORS.DESKTOP_TOGGLE)).toHaveCount(0);
  }

  // --- server rendering (no client JS) -----------------------------------------

  /** The server-rendered header toggle reflects the cookie (JS disabled / bundle blocked). */
  async expectServerRenderedDesktopPressed(pressed: boolean): Promise<void> {
    const toggle = this.page.locator(`${THEME_SELECTORS.HEADER_ICONS} ${THEME_SELECTORS.DESKTOP_TOGGLE}`);
    await expect(toggle).toHaveCount(1, { timeout: t(10000) });
    await expect(toggle).toHaveAttribute('aria-pressed', String(pressed));
  }

  // --- contrast ---------------------------------------------------------------

  async contrastReport(selectors: readonly string[], glyph = false): Promise<ContrastResult[]> {
    return this.page.evaluate(contrastInPage, { selectors, glyph });
  }

  /** Every selector must be present, and meet `min` against its effective background. */
  async expectContrast(selectors: readonly string[], min: number = THEME.MIN_TEXT_CONTRAST, glyph = false): Promise<void> {
    await expect.poll(async () => (await this.contrastReport(selectors, glyph)).filter((r) => !r.found).map((r) => r.selector), {
      timeout: t(15000),
      message: 'contrast spot-check selectors present',
    }).toEqual([]);
    const report = await this.contrastReport(selectors, glyph);
    const failing = report.filter((r) => (r.ratio ?? 0) < min);
    expect(failing, `contrast below ${min}:1\n${JSON.stringify(report, null, 1)}`).toEqual([]);
  }

  /** Non-text contrast (3:1) of the icon-only desktop toggle's glyph against the header. */
  async expectDesktopToggleIconContrast(): Promise<void> {
    await this.expectContrast([`${THEME_SELECTORS.HEADER_ICONS} ${THEME_SELECTORS.DESKTOP_TOGGLE}`], THEME.MIN_NON_TEXT_CONTRAST, true);
  }
}
