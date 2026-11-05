import { expect, BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
// In-page WCAG probes shared with scripts/darkmode/a11y-audit.js (plain CommonJS).
import * as A11Y from '../support/a11y-scan.js';

/**
 * Page object for the Appearance setting (Auto / Light / Dark): the item in the desktop account
 * menu and the row in the mobile hamburger menu.
 *
 * Source of truth: `static/js/AppearanceToggle.jsx` (the controls), `static/js/Header.jsx` (where
 * they sit), `static/js/sefaria/theme.js` (cookie, `<html data-theme>`, following the system),
 * `templates/elements/theme_head.html` (inline head script), `sefaria/system/theme.py` and
 * `templates/base.html` (server-rendered data-theme and theme-color). Contract:
 *
 *   - The PREFERENCE is `auto` | `light` | `dark`, stored only in the `theme` cookie: path `/`,
 *     SameSite=Lax, Secure on https, 20 years, on the shared parent domain (`.sefaria.org`,
 *     `.<name>.cauldron.sefaria.org`) so Library and Voices share it. No cookie, or any other
 *     value, means auto.
 *   - The THEME shown is `light` | `dark` on `<html data-theme>`. For a light or dark preference
 *     the server renders it, with the matching `<meta name="theme-color">`, in the first byte.
 *     For auto the server renders no data-theme: the head script sets it from
 *     `prefers-color-scheme` (light when the browser gives no signal) before any stylesheet, and
 *     theme.js `watchSystemTheme()` follows live system changes while the preference is auto.
 *   - Desktop: there is no header button any more. In the account menu (the person icon when
 *     logged out, the avatar when logged in), right after Site Language:
 *     `.languageHeader.appearanceHeader` ("Appearance" / "מראה"), then
 *     `div.dropdownAppearanceToggle[role=group][aria-label][data-prevent-close="true"]` holding
 *     three `button.appearanceOption[data-appearance=auto|light|dark]` with `aria-pressed`, and
 *     `aria-label` = `title` = "Auto" / "Light" / "Dark" ("אוטומטי" / "בהיר" / "כהה").
 *     Choosing an option keeps the menu open.
 *   - Mobile: `div.mobileAppearanceToggle[role=group][aria-label]` in
 *     `.mobileNavMenu .mobileAccountLinks`, right after `.mobileInterfaceLanguageToggle`, with the
 *     same three buttons inside `span.mobileAppearanceOptions`. Choosing keeps the drawer open.
 *   - Exactly one option is pressed (`aria-pressed="true"` and class `active`, a filled chip).
 *   - Choosing fires `gtag('event', 'appearance_change', {feature_name: 'appearance', from, to,
 *     theme, action: 'header_menu' | 'mobile_menu'})` and updates `<meta name="theme-color">`.
 *
 * EVERY Appearance selector and constant lives in APPEARANCE_SELECTORS / APPEARANCE below, so a
 * class-name change in the feature is a one-place edit. (constants.ts `SITE_CONFIGS.*.tabOrder`
 * no longer lists a theme control: the header has none.)
 */

export type Preference = 'auto' | 'light' | 'dark';
export type ThemeName = 'light' | 'dark';
/** Which control: the desktop account menu item, or the mobile hamburger row. */
export type Surface = 'desktop' | 'mobile';

export const APPEARANCE_SELECTORS = {
  HTML: 'html',
  HEADER: '.header',
  HEADER_ICONS: '.header .header-icons',
  /** Wrapper of the module switcher (9-dot) dropdown: English-stable anchor (no label text). */
  MODULE_SWITCHER: '.headerDropdownMenu[data-anl-feature_name="module_switcher"]',
  /** Account menu wrapper: avatar when logged in, the logged-out person icon otherwise. */
  ACCOUNT_MENU: '.headerDropdownMenu:has(.profile-pic), .headerDropdownMenu:has(img[src*="profile_loggedout_mdl"])',
  /** The focusable trigger inside a DropdownMenu: a <button>, or ProfilePic's tabIndex div. */
  DROPDOWN_TRIGGER: '.dropdownLinks-button > :is(button, a, [tabindex])',
  DROPDOWN_TRIGGER_WRAPPER: '.dropdownLinks-button',
  DROPDOWN_PANEL: '.dropdownLinks-menu',
  OPEN_ACCOUNT_PANEL: '.header .headerDropdownMenu .dropdownLinks-menu.open',
  /** Site Language's two links: the item right before Appearance. */
  LANGUAGE_TOGGLE: '.dropdownLanguageToggle',
  DESKTOP_TITLE: '.languageHeader.appearanceHeader',
  DESKTOP_GROUP: '.dropdownAppearanceToggle',
  OPTION: 'button.appearanceOption',
  MOBILE_MENU: '.mobileNavMenu',
  MOBILE_MENU_OPEN: '.mobileNavMenu:not(.closed)',
  MOBILE_ACCOUNT_LINKS: '.mobileNavMenu .mobileAccountLinks',
  MOBILE_LANGUAGE_TOGGLE: '.mobileInterfaceLanguageToggle',
  MOBILE_LANGUAGE_CONTROLS: '.mobileNavMenu .mobileInterfaceLanguageToggle :is(a, button)',
  MOBILE_GROUP: '.mobileAppearanceToggle',
  MOBILE_OPTIONS: '.mobileAppearanceOptions',
  /** Either control, for "how many groups are in the markup" checks. */
  ANY_GROUP: '.dropdownAppearanceToggle, .mobileAppearanceToggle',
  /** The two-state controls the setting replaced (header moon/sun button, mobile switch). Must stay gone. */
  LEGACY_CONTROLS: 'button.themeToggle, .mobileThemeToggle',
  THEME_COLOR_META: 'meta[name="theme-color"]',
  SKIP_LINK: 'a.skip-link',
} as const;

/** Options in DOM (reading) order. */
export const PREFERENCES: readonly Preference[] = ['auto', 'light', 'dark'];

type Labels = { group: string } & Record<Preference, string>;

export const APPEARANCE = {
  COOKIE: 'theme',
  ATTR: 'data-theme',
  /** `<meta name="theme-color">`: dark, else the module colour (THEME_COLORS in theme.js). */
  THEME_COLOR: { dark: '#181818', library: '#18345D', voices: '#518159' } as Record<string, string>,
  ANALYTICS_EVENT: 'appearance_change',
  ANALYTICS_FEATURE: 'appearance',
  ACTION: { desktop: 'header_menu', mobile: 'mobile_menu' } as Record<Surface, string>,
  LABELS: {
    [LANGUAGES.EN]: { group: 'Appearance', auto: 'Auto', light: 'Light', dark: 'Dark' },
    [LANGUAGES.HE]: { group: 'מראה', auto: 'אוטומטי', light: 'בהיר', dark: 'כהה' },
  } as Record<string, Labels>,
  /** Requests for the client bundle (render_bundle 'main'). */
  CLIENT_BUNDLE_URL: /\/static\/bundles\/client\/.+\.js(\?|$)/,
  /** Relative luminance bounds for "this surface is dark / light". #404040 ~ 0.051. */
  DARK_MAX_LUMINANCE: 0.05,
  LIGHT_MIN_LUMINANCE: 0.8,
  /** WCAG 2.x AA: body text 4.5:1, non-text UI (icons, chips, focus rings) 3:1. */
  MIN_TEXT_CONTRAST: 4.5,
  MIN_NON_TEXT_CONTRAST: 3,
  /** WCAG 2.2 2.5.8 Target Size (Minimum), AA. The options are 36x32 chips. */
  MIN_TARGET_SIZE: 24,
  /** Pages the specs visit (paths on the module's base URL). */
  PATHS: {
    TEXTS: '/texts',
    READER: '/Genesis.1?lang=bi',
  },
  /**
   * Cookie values that are not a preference, so they mean auto and the page follows the system.
   * Each is paired with the system setting that tells "treated as auto" apart from "misread as
   * the value": a lax parser would read LIGHT as light (the dark system shows it is not) and
   * DARK as dark (the light system shows it is not).
   */
  INVALID_COOKIE_CASES: [
    { value: 'purple', system: 'dark' },
    { value: 'LIGHT', system: 'dark' },
    { value: 'DARK', system: 'light' },
  ] as ReadonlyArray<{ value: string; system: ThemeName }>,
  /**
   * An invalid value that starts with "dark" (so a prefix match would wrongly accept it) and must
   * never be echoed into the HTML. Deliberately not a <script> payload: Cloudflare's WAF answers
   * such a cookie with a block page before it reaches Django. Paired with a light system.
   */
  UNECHOED_COOKIE_VALUE: 'dark-e2e-unechoed-7f3a',
  /** The preference is cookie-only: choosing must not write the user's profile. */
  PROFILE_WRITE_URL: /\/api\/profile(\/|\?|$)/,
  /** A desktop window narrowed below the 843px mobile breakpoint (Header swaps to the mobile header). */
  NARROW_VIEWPORT: { width: 390, height: 844 },
  /** Deliberate pacing (wrapped in t()) before a "nothing else happened" check. */
  SETTLE_MS: 500,
} as const;

/** Text selectors spot-checked for contrast. Every entry passes on the light theme today. */
export const APPEARANCE_CONTRAST_SELECTORS = {
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
  /** The open account menu: the Appearance title and the Site Language link above it. */
  ACCOUNT_MENU: [
    '.header .dropdownLinks-menu.open .languageHeader.appearanceHeader',
    '.header .dropdownLinks-menu.open .dropdownLanguageToggle a',
  ],
  MOBILE_MENU: [
    '.mobileNavMenu a[href="/texts"]',
    '.mobileNavMenu .mobileInterfaceLanguageToggle a',
    '.mobileNavMenu .mobileAppearanceToggle > span:not(.mobileAppearanceOptions)',
  ],
} as const;

/** Selectors and pages for the accessibility specs (appearance-a11y.spec.ts, both configs). */
export const APPEARANCE_A11Y = {
  MAIN: '#main',
  /** Where the contrast scans look: the whole page body, the open account menu, the open drawer. */
  SCAN_PAGE: ['body'],
  SCAN_ACCOUNT_MENU: ['.header .dropdownLinks-menu.open'],
  SCAN_MOBILE_MENU: ['.mobileNavMenu'],
  /** Links in running text (1.4.1): topic descriptions on the /topics landing page. */
  RUNNING_TEXT_ROOTS: ['.topicDescription', '.reactMarkdown', '.sheetContent .segment'],
  PATHS: {
    TEXTS: '/texts',
    READER: '/Genesis.1?lang=bi',
    CONNECTIONS: '/Genesis.1.1?with=all',
    TOPICS: '/topics',
  },
  /** Characters that must never be single-key shortcuts for the appearance (2.1.4). */
  CHARACTER_KEYS: ['a', 'A', 'd', 'D', 'l', 'L', 't', 'm', 'n'],
  /** Tab presses allowed to walk from the top of the page through the header. */
  MAX_TABS: 30,
  /** Tab presses allowed inside the open account menu (Log in … Help is under 12 stops). */
  MAX_MENU_TABS: 12,
  MIN_FOCUS_CONTRAST: 3,
} as const;

export type ScanRow = {
  selector: string; text: string; status: 'pass' | 'fail' | 'skip'; reason?: string;
  fg?: string; bg?: string; ratio?: number; min?: number; large?: boolean;
};
export type FocusInfo = {
  focused: boolean; tag?: string; name?: string; href?: string | null; inViewport?: boolean;
  ring?: { source: string; width: number; offset: number; style: string; colour: string | null; background: string; contrast: number | null };
  /** data-appearance of the focused option, or null when focus is not on an option. */
  option?: string | null;
  inDesktopGroup?: boolean; inMobileGroup?: boolean; isLegacyToggle?: boolean; isSkipLink?: boolean;
  inModuleSwitcher?: boolean; isAccountTrigger?: boolean; inAccountPanel?: boolean;
  inLanguageToggle?: boolean; inMobileMenu?: boolean; inHeader?: boolean;
};
export type FocusPixels = { changed: number; atLeast3: number; maxContrast: number; p90Contrast: number } | null;
export type OptionContrastRow = {
  value: string; pressed: boolean; chip: string; surround: string; icon: string | null;
  chipOnSurround: number; iconOnChip: number | null;
};

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

export type ServerHtml = {
  status: number;
  /** data-theme on the server's <html> tag, or null when the server rendered none (auto). */
  dataTheme: string | null;
  themeColor: string | null;
  activeModule: string | null;
  body: string;
};

/** The theme a preference shows under a given system setting. */
export const themeFor = (pref: Preference, system: ThemeName = 'light'): ThemeName =>
  (pref === 'auto' ? system : pref);

const OPEN_CLASS = /(^|\s)open(\s|$)/;
const ACTIVE_CLASS = /(^|\s)active(\s|$)/;

// -----------------------------------------------------------------------------
// Context-level setup. These must run BEFORE the navigation they affect (the first one:
// before goToPageWithLang / goToPageWithUser), which is why they are functions on the
// context rather than page-object methods.
// -----------------------------------------------------------------------------

const isHostOnly = (host: string) =>
  host === 'localhost' || host.endsWith('.localhost') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

/**
 * The domain the app writes the `theme` cookie on: the parent of the language's hostnames
 * (`www.sefaria.org` -> `.sefaria.org`, `www.dark.cauldron.sefaria.org` ->
 * `.dark.cauldron.sefaria.org`), mirroring `Sefaria.util.getCookieDomain()`.
 * `null` means host-only (localhost / IP, where the app sets no domain).
 */
export function themeCookieDomain(url: string): string | null {
  const host = new URL(url).hostname;
  if (isHostOnly(host)) return null;
  const parts = host.split('.');
  return parts.length >= 3 ? '.' + parts.slice(1).join('.') : '.' + host;
}

/** Seed the `theme` cookie (any raw value, to test invalid ones too) before a navigation. */
export async function seedThemeCookie(context: BrowserContext, url: string, value: string) {
  const domain = themeCookieDomain(url);
  const u = new URL(url);
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  await context.addCookies([
    domain
      ? { name: APPEARANCE.COOKIE, value, domain, path: '/', secure: u.protocol === 'https:', sameSite: 'Lax' as const, expires }
      : { name: APPEARANCE.COOKIE, value, url: u.origin, sameSite: 'Lax' as const, expires },
  ]);
}

/**
 * Record the page background at DOMContentLoaded and at the first animation frame in which
 * <body> exists. rAF callbacks do not run while render-blocking stylesheets are pending, so the
 * rAF sample is what the first painted frame looks like. Runs on every document the context
 * loads from now on (reloads included). Read back with `getPaintSamples()`.
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
 * Make `gtag('event', …)` observable whether or not the sandbox configures GA: define `dataLayer`
 * and a queueing `gtag` stub before any page script. base.html's own
 * `function gtag(){dataLayer.push(arguments)}` (when GOOGLE_GTAG is set) replaces the stub with an
 * identical one and keeps pushing into the same array.
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
 * Abort every client-bundle request, so only the server-rendered attribute and the inline head
 * script can set the theme. Returns a live counter: assert it is > 0 so the test cannot pass
 * because the pattern silently stopped matching.
 */
export async function blockClientBundle(context: BrowserContext): Promise<{ blocked: string[] }> {
  const state = { blocked: [] as string[] };
  await context.route(APPEARANCE.CLIENT_BUNDLE_URL, async (route) => {
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
  if (L <= APPEARANCE.DARK_MAX_LUMINANCE) return 'dark';
  if (L >= APPEARANCE.LIGHT_MIN_LUMINANCE) return 'light';
  return 'mid-tone';
}

/**
 * Contrast of each selector's first visible match against its effective background (ancestor
 * background colors composited down to an opaque one, or the canvas: #121212 under
 * `color-scheme: dark`, white otherwise). Background images are ignored but flagged. The element
 * needs text and is measured by its `color`.
 */
function contrastInPage({ selectors }: { selectors: readonly string[] }) {
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
      .find((e) => e === document.body || (visible(e) && (e.textContent || '').trim().length > 0));
    if (!el) return { selector, found: false };
    const { bg, image } = effectiveBg(el);
    const fgRaw = parse(getComputedStyle(el).color);
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

export class AppearancePage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- labels ------------------------------------------------------------------

  /** Accessible names in the current interface language. */
  private get labels(): Labels {
    return APPEARANCE.LABELS[this.language] ?? APPEARANCE.LABELS[LANGUAGES.EN];
  }

  /** The group's name ("Appearance") or an option's name ("Auto" / "Light" / "Dark"). */
  label(key: Preference | 'group'): string {
    return this.labels[key];
  }

  // --- locators --------------------------------------------------------------

  private get html(): Locator {
    return this.page.locator(APPEARANCE_SELECTORS.HTML);
  }

  private get headerIcons(): Locator {
    return this.page.locator(APPEARANCE_SELECTORS.HEADER_ICONS);
  }

  private get moduleSwitcherTrigger(): Locator {
    return this.headerIcons.locator(APPEARANCE_SELECTORS.MODULE_SWITCHER).locator(APPEARANCE_SELECTORS.DROPDOWN_TRIGGER).first();
  }

  private get accountMenu(): Locator {
    return this.headerIcons.locator(APPEARANCE_SELECTORS.ACCOUNT_MENU).first();
  }

  private get accountTrigger(): Locator {
    return this.accountMenu.locator(APPEARANCE_SELECTORS.DROPDOWN_TRIGGER).first();
  }

  private get accountPanel(): Locator {
    return this.accountMenu.locator(APPEARANCE_SELECTORS.DROPDOWN_PANEL).first();
  }

  private get desktopTitle(): Locator {
    return this.accountPanel.locator(APPEARANCE_SELECTORS.DESKTOP_TITLE);
  }

  /** The desktop group, anchored on BOTH the contract class and its role + accessible name. */
  private get desktopGroup(): Locator {
    return this.accountPanel.locator(APPEARANCE_SELECTORS.DESKTOP_GROUP).and(
      this.page.getByRole('group', { name: this.label('group'), exact: true }),
    );
  }

  private get mobileMenuOpen(): Locator {
    return this.page.locator(APPEARANCE_SELECTORS.MOBILE_MENU_OPEN);
  }

  /** The mobile row, anchored on BOTH the contract class and its role + accessible name. */
  private get mobileGroup(): Locator {
    return this.page.locator(`${APPEARANCE_SELECTORS.MOBILE_ACCOUNT_LINKS} ${APPEARANCE_SELECTORS.MOBILE_GROUP}`).and(
      this.page.getByRole('group', { name: this.label('group'), exact: true }),
    );
  }

  private group(surface: Surface): Locator {
    return surface === 'desktop' ? this.desktopGroup : this.mobileGroup;
  }

  private option(surface: Surface, pref: Preference): Locator {
    return this.group(surface).locator(`${APPEARANCE_SELECTORS.OPTION}[data-appearance="${pref}"]`);
  }

  private get themeColorMeta(): Locator {
    return this.page.locator(APPEARANCE_SELECTORS.THEME_COLOR_META);
  }

  private get skipLink(): Locator {
    return this.page.locator(APPEARANCE_SELECTORS.SKIP_LINK);
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

  /** Deliberate pacing before a "nothing else happened" check (rule 6: wrapped in t()). */
  async settle(): Promise<void> {
    await this.page.waitForTimeout(t(APPEARANCE.SETTLE_MS));
  }

  // --- theme state -------------------------------------------------------------

  async expectTheme(theme: ThemeName): Promise<void> {
    await expect(this.html, `<html ${APPEARANCE.ATTR}>`).toHaveAttribute(APPEARANCE.ATTR, theme, { timeout: t(10000) });
    await this.expectPageBackground(theme);
  }

  /** A theme set now, and still set after a pause: for "the system change was ignored". */
  async expectThemeStays(theme: ThemeName): Promise<void> {
    await this.settle();
    await this.expectTheme(theme);
  }

  /** No data-theme at all: auto rendered by the server with no script to resolve it (JS off). */
  async expectNoThemeAttribute(): Promise<void> {
    await expect(this.html, `<html> without ${APPEARANCE.ATTR}`).not.toHaveAttribute(APPEARANCE.ATTR);
  }

  /**
   * What the user sees behind the page: body background, else <html> background, else the canvas
   * (dark only under `color-scheme: dark`). Dark must be below #404040 luminance, light above ~#e6e6e6.
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

  /** Remove every `theme` cookie (then reload to see auto). */
  async clearThemeCookie(): Promise<void> {
    await this.page.context().clearCookies({ name: APPEARANCE.COOKIE });
  }

  /** Emulate the OS setting (prefers-color-scheme) for this page, live and for later loads. */
  async emulateSystemTheme(theme: ThemeName): Promise<void> {
    await this.page.emulateMedia({ colorScheme: theme });
    await this.expectSystemTheme(theme);
  }

  async expectSystemTheme(theme: ThemeName): Promise<void> {
    expect(await this.page.evaluate(() => window.matchMedia('(prefers-color-scheme: dark)').matches),
      `prefers-color-scheme is ${theme}`).toBe(theme === 'dark');
  }

  /** The served HTML must not echo a raw cookie value (e.g. an injected script). */
  async expectMarkupExcludes(text: string): Promise<void> {
    expect((await this.page.content()).includes(text), `page markup contains ${JSON.stringify(text)}`).toBe(false);
    expect((await this.serverHtml()).body.includes(text), `server HTML contains ${JSON.stringify(text)}`).toBe(false);
  }

  /**
   * Start counting full document loads. Returns a getter so a test can assert that choosing an
   * option is instant (no reload, no server round-trip for the page).
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
      if (req.method() !== 'GET' && APPEARANCE.PROFILE_WRITE_URL.test(req.url())) writes.push(`${req.method()} ${req.url()}`);
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

  /** The theme-color for `theme` on this page's module: dark #181818, light the module colour. */
  async themeColorFor(theme: ThemeName): Promise<string> {
    if (theme === 'dark') return APPEARANCE.THEME_COLOR.dark;
    const module = await this.page.locator('body').getAttribute('data-active-module');
    return APPEARANCE.THEME_COLOR[module ?? 'library'] ?? APPEARANCE.THEME_COLOR.library;
  }

  async expectThemeColorFor(theme: ThemeName): Promise<void> {
    await this.expectThemeColor(await this.themeColorFor(theme));
  }

  /**
   * Exactly one `theme` cookie holding `pref`: on the app's shared cookie domain, path `/`,
   * persistent (at least a year), Secure on https, SameSite=Lax (not asserted on WebKit, whose
   * cookie API does not report SameSite reliably). `null` asserts there is no `theme` cookie at all.
   */
  async expectThemeCookie(pref: Preference | null): Promise<void> {
    const url = this.page.url();
    const domain = themeCookieDomain(url) ?? new URL(url).hostname;
    const secure = new URL(url).protocol === 'https:';
    const checkSameSite = this.page.context().browser()?.browserType().name() !== 'webkit';
    const describe = async () => (await this.page.context().cookies())
      .filter((c) => c.name === APPEARANCE.COOKIE)
      .map((c) => ({
        value: c.value,
        domain: c.domain,
        path: c.path,
        persistent: c.expires > Date.now() / 1000 + 60 * 60 * 24 * 365,
        secure: c.secure,
        ...(checkSameSite ? { sameSite: c.sameSite } : {}),
      }));
    if (pref === null) {
      await expect.poll(describe, { timeout: t(5000), message: 'no theme cookie expected' }).toEqual([]);
      return;
    }
    await expect.poll(describe, { timeout: t(5000), message: `one ${APPEARANCE.COOKIE}=${pref} cookie on ${domain}` })
      .toEqual([{ value: pref, domain, path: '/', persistent: true, secure, ...(checkSameSite ? { sameSite: 'Lax' } : {}) }]);
  }

  // --- the server's first byte ---------------------------------------------------

  /**
   * The HTML the server sends for `url` (default: this page) with this context's cookies, before
   * any script runs: what is in the first byte.
   */
  async serverHtml(url: string = this.page.url()): Promise<ServerHtml> {
    const res = await this.page.request.get(url.split('#')[0], { headers: { Accept: 'text/html' }, timeout: t(30000) });
    const body = await res.text();
    const htmlTag = /<html\b[^>]*>/i.exec(body)?.[0] ?? '';
    return {
      status: res.status(),
      dataTheme: /\sdata-theme="([^"]*)"/i.exec(htmlTag)?.[1] ?? null,
      themeColor: /<meta\s+name="theme-color"\s+content="([^"]*)"/i.exec(body)?.[1] ?? null,
      activeModule: /<body\b[^>]*\sdata-active-module="([^"]*)"/i.exec(body)?.[1] ?? null,
      body,
    };
  }

  /**
   * The server rendered `<html data-theme="<theme>">` and the matching theme-color in the first
   * byte (light / dark preference), or, for `null` (auto, or an invalid cookie), no data-theme
   * and the module's light theme-color, leaving the choice to the head script.
   */
  async expectServerRendered(theme: ThemeName | null): Promise<void> {
    const s = await this.serverHtml();
    const detail = JSON.stringify({ status: s.status, dataTheme: s.dataTheme, themeColor: s.themeColor, activeModule: s.activeModule });
    expect(s.status, `server HTML status ${detail}`).toBe(200);
    expect(s.dataTheme, `server-rendered data-theme ${detail}`).toBe(theme);
    const light = APPEARANCE.THEME_COLOR[s.activeModule ?? 'library'] ?? APPEARANCE.THEME_COLOR.library;
    const color = theme === 'dark' ? APPEARANCE.THEME_COLOR.dark : light;
    expect((s.themeColor ?? '').toUpperCase(), `server-rendered theme-color ${detail}`).toBe(color.toUpperCase());
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

  /** Params of every `gtag('event', 'appearance_change', params)` so far (installAnalyticsCapture). */
  async getAppearanceEvents(): Promise<Record<string, unknown>[]> {
    return this.page.evaluate((name) => {
      const dl = ((window as any).dataLayer || []) as any[];
      return dl
        .filter((e) => e && typeof e === 'object' && e.length >= 2 && e[0] === 'event' && e[1] === name)
        .map((e) => JSON.parse(JSON.stringify(e[2] ?? {})));
    }, APPEARANCE.ANALYTICS_EVENT);
  }

  async expectAppearanceEventCount(count: number): Promise<void> {
    await expect.poll(async () => (await this.getAppearanceEvents()).length, {
      timeout: t(5000),
      message: `${APPEARANCE.ANALYTICS_EVENT} analytics events`,
    }).toBe(count);
  }

  /** The latest event is {feature_name: 'appearance', from, to, theme, action} for `surface`. */
  async expectLastAppearanceEvent(surface: Surface, e: { from: Preference; to: Preference; theme: ThemeName }): Promise<void> {
    const events = await this.getAppearanceEvents();
    expect(events.at(-1), JSON.stringify(events)).toEqual(expect.objectContaining({
      feature_name: APPEARANCE.ANALYTICS_FEATURE, from: e.from, to: e.to, theme: e.theme, action: APPEARANCE.ACTION[surface],
    }));
  }

  // --- the option group (both surfaces) -----------------------------------------

  /**
   * The group is a labelled `role=group` holding exactly Auto, Light, Dark in that order: each a
   * `type=button` with aria-label = title = its name, and exactly one pressed (`aria-pressed` and
   * the `active` chip class), `pref`.
   */
  private async expectGroupState(group: Locator, pref: Preference): Promise<void> {
    await expect(group).toBeVisible({ timeout: t(10000) });
    await expect(group).toHaveAttribute('role', 'group');
    await expect(group).toHaveAccessibleName(this.label('group'));
    const options = group.locator(APPEARANCE_SELECTORS.OPTION);
    await expect(options).toHaveCount(PREFERENCES.length);
    expect(await options.evaluateAll((els) => els.map((e) => e.getAttribute('data-appearance'))), 'option order')
      .toEqual([...PREFERENCES]);
    for (const p of PREFERENCES) {
      const option = group.locator(`${APPEARANCE_SELECTORS.OPTION}[data-appearance="${p}"]`);
      await expect(option).toHaveAttribute('aria-pressed', String(p === pref), { timeout: t(5000) });
      if (p === pref) await expect(option).toHaveClass(ACTIVE_CLASS);
      else await expect(option).not.toHaveClass(ACTIVE_CLASS);
      await expect(option).toHaveAttribute('type', 'button');
      await expect(option).toHaveAccessibleName(this.label(p));
      await expect(option).toHaveAttribute('title', this.label(p));
    }
    await expect(group.locator(`${APPEARANCE_SELECTORS.OPTION}[aria-pressed="true"]`), 'exactly one pressed option').toHaveCount(1);
  }

  /** In reading order on screen: left to right in LTR, right to left in RTL. */
  private expectReadingOrder(options: Array<{ value: string | null; x: number }>, rtl: boolean): void {
    expect(options.map((o) => o.value), 'option order').toEqual([...PREFERENCES]);
    const dir = rtl ? -1 : 1;
    for (let i = 1; i < options.length; i++) {
      expect(dir * (options[i].x - options[i - 1].x), `${options[i].value} is drawn after ${options[i - 1].value} (${rtl ? 'RTL' : 'LTR'})`)
        .toBeGreaterThan(0);
    }
  }

  /**
   * Activate an option the way the device does: tap where the context has touch, click otherwise
   * (a desktop window narrowed to the mobile layout has no touch).
   */
  private async activate(target: Locator): Promise<void> {
    try {
      await target.tap();
    } catch (e) {
      if (!/hasTouch|does not support tap/i.test(String(e))) throw e;
      await target.click();
    }
  }

  // --- desktop: the account menu ---------------------------------------------------

  /** The old header moon/sun button is gone, and no Appearance option shows outside the open menu. */
  async expectNoHeaderThemeButton(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.accountTrigger).toBeVisible({ timeout: t(15000) });
    await expect(this.page.locator(APPEARANCE_SELECTORS.LEGACY_CONTROLS)).toHaveCount(0);
    await expect(this.accountPanel).not.toHaveClass(OPEN_CLASS);
    await expect(this.page.locator(`${APPEARANCE_SELECTORS.HEADER} ${APPEARANCE_SELECTORS.OPTION}:visible`)).toHaveCount(0);
  }

  private async isAccountMenuOpen(): Promise<boolean> {
    return OPEN_CLASS.test((await this.accountPanel.getAttribute('class').catch(() => null)) ?? '');
  }

  /** Open the account menu with the mouse (retrying a click dropped while the header hydrates). */
  async openAccountMenu(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.accountTrigger).toBeVisible({ timeout: t(15000) });
    await expect(async () => {
      if (!(await this.isAccountMenuOpen())) await this.accountTrigger.click();
      await expect(this.accountPanel).toHaveClass(OPEN_CLASS, { timeout: t(1500) });
    }).toPass({ timeout: t(15000) });
    await expect(this.desktopGroup).toBeVisible({ timeout: t(5000) });
  }

  /** Escape closes the menu (if open). */
  async closeAccountMenu(): Promise<void> {
    if (!(await this.isAccountMenuOpen())) return;
    await this.page.keyboard.press('Escape');
    await expect(this.accountPanel).not.toHaveClass(OPEN_CLASS, { timeout: t(5000) });
  }

  async expectAccountMenuOpen(): Promise<void> {
    await expect(this.accountPanel).toHaveClass(OPEN_CLASS, { timeout: t(5000) });
    await expect(this.desktopGroup).toBeVisible();
  }

  /** Open now, and still open after a pause (no delayed close from a bubbling click). */
  async expectAccountMenuStillOpen(): Promise<void> {
    await this.expectAccountMenuOpen();
    await this.settle();
    await this.expectAccountMenuOpen();
  }

  /**
   * In the account menu: the "Appearance" title is the element right after Site Language's
   * `.dropdownLanguageToggle`, the group right after the title (and below it on screen), the
   * group keeps the menu open (`data-prevent-close`), and the options are drawn in reading order.
   */
  async expectDesktopPlacement(): Promise<void> {
    if (!(await this.isAccountMenuOpen())) await this.openAccountMenu();
    await expect(this.desktopTitle).toBeVisible();
    await expect(this.desktopTitle).toHaveText(this.label('group'));
    const p = await this.accountPanel.evaluate((panel, sel) => {
      const title = panel.querySelector(sel.DESKTOP_TITLE);
      const group = panel.querySelector(sel.DESKTOP_GROUP);
      if (!title || !group) return { error: 'the Appearance title or group is missing from the account menu' };
      const lang = title.previousElementSibling;
      const box = (e: Element) => e.getBoundingClientRect();
      return {
        titleAfterLanguage: !!lang && lang.matches(sel.LANGUAGE_TOGGLE),
        previous: lang ? `${lang.tagName.toLowerCase()}.${Array.from(lang.classList).join('.')}` : null,
        groupAfterTitle: group.previousElementSibling === title,
        preventClose: group.getAttribute('data-prevent-close'),
        titleBelowLanguage: !!lang && box(title).top >= box(lang).bottom - 1,
        groupBelowTitle: box(group).top >= box(title).bottom - 1,
        rtl: getComputedStyle(group).direction === 'rtl',
        options: Array.from(group.querySelectorAll(sel.OPTION)).map((o) => ({
          value: o.getAttribute('data-appearance'), x: box(o).left + box(o).width / 2,
        })),
      };
    }, APPEARANCE_SELECTORS);
    expect(p, JSON.stringify(p)).not.toHaveProperty('error');
    const placement = p as { rtl: boolean; options: Array<{ value: string | null; x: number }> };
    expect(p, JSON.stringify(p)).toEqual(expect.objectContaining({
      titleAfterLanguage: true, groupAfterTitle: true, preventClose: 'true', titleBelowLanguage: true, groupBelowTitle: true,
    }));
    this.expectReadingOrder(placement.options, placement.rtl);
  }

  async chooseDesktop(pref: Preference): Promise<void> {
    if (!(await this.isAccountMenuOpen())) await this.openAccountMenu();
    const option = this.option('desktop', pref);
    await expect(option).toBeVisible({ timeout: t(5000) });
    await option.click();
  }

  /** The account menu's group shows `pref` pressed (opens the menu if needed). */
  async expectDesktopPressed(pref: Preference): Promise<void> {
    if (!(await this.isAccountMenuOpen())) await this.openAccountMenu();
    await this.expectGroupState(this.desktopGroup, pref);
  }

  /** Choose `pref` in the account menu and wait for it to be pressed and `theme` shown. */
  async selectDesktop(pref: Preference, theme: ThemeName): Promise<void> {
    await this.chooseDesktop(pref);
    await this.expectGroupState(this.desktopGroup, pref);
    await this.expectTheme(theme);
  }

  // --- mobile: the hamburger row ------------------------------------------------------

  async expectMobileRowVisible(): Promise<void> {
    await expect(this.mobileMenuOpen).toBeVisible({ timeout: t(5000) });
    await expect(this.mobileGroup).toBeVisible({ timeout: t(10000) });
    await this.mobileGroup.scrollIntoViewIfNeeded();
    await expect(this.mobileGroup).toBeInViewport();
  }

  /**
   * Directly after the interface-language row inside `.mobileAccountLinks` (and below it on
   * screen), the options inside `.mobileAppearanceOptions`, drawn in reading order.
   */
  async expectMobilePlacement(): Promise<void> {
    await this.expectMobileRowVisible();
    const p = await this.page.evaluate((sel) => {
      const links = document.querySelector(sel.MOBILE_ACCOUNT_LINKS);
      const group = links && links.querySelector(sel.MOBILE_GROUP);
      if (!links || !group) return { error: 'the Appearance row is not inside .mobileAccountLinks' };
      let row: Element = group;
      while (row.parentElement && row.parentElement !== links) row = row.parentElement;
      const prev = row.previousElementSibling;
      const lang = links.querySelector(sel.MOBILE_LANGUAGE_TOGGLE);
      const box = (e: Element) => e.getBoundingClientRect();
      return {
        previousIsLanguageToggle: !!prev && (prev.matches(sel.MOBILE_LANGUAGE_TOGGLE) || !!prev.querySelector(sel.MOBILE_LANGUAGE_TOGGLE)),
        previous: prev ? `${prev.tagName.toLowerCase()}.${Array.from(prev.classList).join('.')}` : null,
        belowLanguageRow: !!lang && box(row).top >= box(lang).bottom - 1,
        optionsInRow: group.querySelectorAll(`${sel.MOBILE_OPTIONS} ${sel.OPTION}`).length,
        rtl: getComputedStyle(group).direction === 'rtl',
        options: Array.from(group.querySelectorAll(sel.OPTION)).map((o) => ({
          value: o.getAttribute('data-appearance'), x: box(o).left + box(o).width / 2,
        })),
      };
    }, APPEARANCE_SELECTORS);
    expect(p, JSON.stringify(p)).not.toHaveProperty('error');
    const placement = p as { rtl: boolean; options: Array<{ value: string | null; x: number }> };
    expect(p, JSON.stringify(p)).toEqual(expect.objectContaining({
      previousIsLanguageToggle: true, belowLanguageRow: true, optionsInRow: PREFERENCES.length,
    }));
    this.expectReadingOrder(placement.options, placement.rtl);
  }

  /** 2.5.8 (AA): each option is at least 24x24 CSS px. */
  async expectMobileTargetSize(): Promise<void> {
    for (const pref of PREFERENCES) {
      const box = await this.option('mobile', pref).boundingBox();
      expect(box, `${pref} option bounding box`).not.toBeNull();
      expect(box!.width, `${pref} target width`).toBeGreaterThanOrEqual(APPEARANCE.MIN_TARGET_SIZE);
      expect(box!.height, `${pref} target height`).toBeGreaterThanOrEqual(APPEARANCE.MIN_TARGET_SIZE);
    }
  }

  async chooseMobile(pref: Preference): Promise<void> {
    await expect(this.mobileMenuOpen).toBeVisible({ timeout: t(5000) });
    const option = this.option('mobile', pref);
    await expect(option).toBeVisible({ timeout: t(10000) });
    await option.scrollIntoViewIfNeeded();
    await this.activate(option);
  }

  async expectMobilePressed(pref: Preference): Promise<void> {
    await this.expectGroupState(this.mobileGroup, pref);
  }

  /** Choose `pref` in the drawer and wait for it to be pressed and `theme` shown. */
  async selectMobile(pref: Preference, theme: ThemeName): Promise<void> {
    await this.chooseMobile(pref);
    await this.expectGroupState(this.mobileGroup, pref);
    await this.expectTheme(theme);
  }

  /** Open now, and still open after a pause (no delayed close from a bubbling onClick). */
  async expectMobileMenuStillOpen(): Promise<void> {
    await expect(this.mobileMenuOpen).toBeVisible({ timeout: t(5000) });
    await this.settle();
    await expect(this.mobileMenuOpen).toBeVisible();
    await expect(this.mobileGroup).toBeVisible();
  }

  /**
   * With the drawer closed, no Appearance control is visible anywhere: not in the mobile top bar,
   * and the desktop account menu (which SSR renders, since the server renders both headers) is
   * gone once the client mounts the mobile header. The old two-state controls do not exist.
   */
  async expectNoControlOutsideMobileMenu(): Promise<void> {
    await expect(this.mobileMenuOpen).toHaveCount(0);
    await expect(this.page.locator(APPEARANCE_SELECTORS.DESKTOP_GROUP)).toHaveCount(0, { timeout: t(10000) });
    await expect(this.page.locator(`${APPEARANCE_SELECTORS.OPTION}:visible`)).toHaveCount(0);
    await expect(this.page.locator(APPEARANCE_SELECTORS.LEGACY_CONTROLS)).toHaveCount(0);
  }

  // --- a desktop window narrowed to the mobile layout ----------------------------------

  /** Narrow the window below the mobile breakpoint; returns the size to restore. */
  async narrowWindow(): Promise<{ width: number; height: number }> {
    const before = this.page.viewportSize() ?? { width: 1280, height: 720 };
    await this.page.setViewportSize(APPEARANCE.NARROW_VIEWPORT);
    // Header renders only the header that matches the breakpoint once mounted.
    await expect(this.page.locator(APPEARANCE_SELECTORS.DESKTOP_GROUP)).toHaveCount(0, { timeout: t(10000) });
    return before;
  }

  async restoreWindow(size: { width: number; height: number }): Promise<void> {
    await this.page.setViewportSize(size);
    await expect(this.accountTrigger).toBeVisible({ timeout: t(10000) });
  }

  // --- server rendering (no client JS) -----------------------------------------

  /**
   * The server-rendered controls (bundle blocked or JS disabled: SSR markup, both headers) show
   * `pref` pressed: every group in the markup has exactly that option pressed.
   */
  async expectServerRenderedPressed(pref: Preference): Promise<void> {
    const groups = this.page.locator(APPEARANCE_SELECTORS.ANY_GROUP);
    await expect(groups.first()).toBeAttached({ timeout: t(10000) });
    const pressed = await this.page.locator(`${APPEARANCE_SELECTORS.OPTION}[aria-pressed="true"]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-appearance')));
    expect(pressed, 'one pressed option per server-rendered group').toHaveLength(await groups.count());
    expect([...new Set(pressed)], 'server-rendered pressed option').toEqual([pref]);
  }

  // --- contrast ---------------------------------------------------------------

  async contrastReport(selectors: readonly string[]): Promise<ContrastResult[]> {
    return this.page.evaluate(contrastInPage, { selectors });
  }

  /** Every selector must be present, and meet `min` against its effective background. */
  async expectContrast(selectors: readonly string[], min: number = APPEARANCE.MIN_TEXT_CONTRAST): Promise<void> {
    await expect.poll(async () => (await this.contrastReport(selectors)).filter((r) => !r.found).map((r) => r.selector), {
      timeout: t(15000),
      message: 'contrast spot-check selectors present',
    }).toEqual([]);
    const report = await this.contrastReport(selectors);
    const failing = report.filter((r) => (r.ratio ?? 0) < min);
    expect(failing, `contrast below ${min}:1\n${JSON.stringify(report, null, 1)}`).toEqual([]);
  }

  private groupSelector(surface: Surface): string {
    return surface === 'desktop'
      ? `${APPEARANCE_SELECTORS.OPEN_ACCOUNT_PANEL} ${APPEARANCE_SELECTORS.DESKTOP_GROUP}`
      : `${APPEARANCE_SELECTORS.MOBILE_MENU} ${APPEARANCE_SELECTORS.MOBILE_GROUP}`;
  }

  /** Each option's chip and icon contrast as painted, with the mouse moved off the options. */
  async optionContrast(surface: Surface): Promise<OptionContrastRow[]> {
    await expect(this.group(surface)).toBeVisible({ timeout: t(10000) });
    await this.page.mouse.move(0, 0);
    const rows = await this.page.evaluate(A11Y.scanToggleGroup, {
      root: this.groupSelector(surface), option: APPEARANCE_SELECTORS.OPTION,
    }) as OptionContrastRow[] | null;
    expect(rows, 'Appearance group found for the contrast probe').not.toBeNull();
    return rows!;
  }

  /**
   * 1.4.11 (AA): the pressed chip stands out from the menu by `min`:1, and every icon (white on the
   * chip, secondary ink on the menu) reaches `min`:1 against what it is drawn on.
   */
  async expectOptionContrast(surface: Surface, min: number = APPEARANCE.MIN_NON_TEXT_CONTRAST): Promise<OptionContrastRow[]> {
    const rows = await this.optionContrast(surface);
    const detail = JSON.stringify(rows, null, 1);
    expect(rows.map((r) => r.value), detail).toEqual([...PREFERENCES]);
    const pressed = rows.filter((r) => r.pressed);
    expect(pressed, `exactly one pressed option ${detail}`).toHaveLength(1);
    expect(pressed[0].chipOnSurround, `pressed chip against the menu ${detail}`).toBeGreaterThanOrEqual(min);
    for (const r of rows) expect(r.iconOnChip ?? 0, `${r.value} icon ${detail}`).toBeGreaterThanOrEqual(min);
    return rows;
  }

  // --- keyboard and accessibility (appearance-a11y specs) -------------------------------
  // The probes run in the page (e2e-tests/support/a11y-scan.js); these methods wrap them in
  // assertions. See the compliance mapping in the spec headers.

  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /** Put the sequential-focus starting point at the start of <body>, as on a fresh load. */
  async focusFromTop(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
      const s = document.createElement('span');
      s.tabIndex = -1;
      document.body.prepend(s);
      s.focus();
      s.remove();
    });
  }

  /** What has focus now, with where it sits relative to the header, the menus and the options. */
  async focusInfo(): Promise<FocusInfo> {
    const info = (await this.page.evaluate(A11Y.describeFocus)) as FocusInfo;
    const where = await this.page.evaluate((sel) => {
      const a = document.activeElement;
      const is = (s: string) => !!(a && a.matches(s));
      const inside = (s: string) => !!(a && a.closest(s));
      return {
        option: is(sel.OPTION) ? a!.getAttribute('data-appearance') : null,
        inDesktopGroup: inside(sel.DESKTOP_GROUP),
        inMobileGroup: inside(sel.MOBILE_GROUP),
        isLegacyToggle: is(sel.LEGACY_CONTROLS),
        isSkipLink: is(sel.SKIP_LINK),
        inModuleSwitcher: inside(sel.MODULE_SWITCHER),
        isAccountTrigger: inside(sel.ACCOUNT_MENU) && inside(sel.DROPDOWN_TRIGGER_WRAPPER),
        inAccountPanel: inside(sel.ACCOUNT_MENU) && inside(sel.DROPDOWN_PANEL),
        inLanguageToggle: inside(sel.LANGUAGE_TOGGLE),
        inMobileMenu: inside(sel.MOBILE_MENU),
        inHeader: inside(sel.HEADER),
      };
    }, APPEARANCE_SELECTORS);
    return { ...info, ...where };
  }

  /** Press Tab `count` times from the current point, recording every stop. */
  async tabStops(count: number): Promise<FocusInfo[]> {
    const stops: FocusInfo[] = [];
    for (let i = 0; i < count; i++) {
      await this.page.keyboard.press('Tab');
      stops.push(await this.focusInfo());
    }
    return stops;
  }

  private summary(stops: FocusInfo[]): string {
    return stops.map((s) => `${s.tag}:${s.option ?? s.name}`).join(' | ');
  }

  /**
   * 2.1.1 / 2.1.2 / 2.4.3, menu closed: from the top of the page Tab reaches the skip link first,
   * then the header, with the account menu button right after the module switcher (the theme
   * button that sat between them is gone), never an Appearance option while the menu is closed,
   * and focus keeps moving past the header (no trap).
   */
  async expectHeaderTabSequence(): Promise<FocusInfo[]> {
    await this.closeAccountMenu();
    await this.focusFromTop();
    const stops = await this.tabStops(APPEARANCE_A11Y.MAX_TABS);
    const summary = this.summary(stops);
    expect(stops[0].isSkipLink, `first Tab stop is the skip link (${summary})`).toBe(true);
    expect(stops.filter((s) => s.option || s.isLegacyToggle), `no Appearance stop while the menu is closed (${summary})`).toEqual([]);
    const i = stops.findIndex((s) => s.isAccountTrigger);
    expect(i, `Tab reaches the account menu button (${summary})`).toBeGreaterThan(0);
    expect(stops[i - 1].inModuleSwitcher, `the stop before the account menu is the module switcher (${summary})`).toBe(true);
    const after = stops.slice(i + 1);
    expect(after.some((s) => s.focused && !s.inHeader), `focus leaves the header after the account menu (${summary})`).toBe(true);
    expect(new Set(after.map((s) => `${s.tag}|${s.name}|${s.href}`)).size, `focus keeps moving (${summary})`).toBeGreaterThan(3);
    return stops;
  }

  /**
   * Open the account menu from the keyboard: Tab from the module switcher to the account button,
   * then Enter. DropdownMenu moves focus to the first item in the menu.
   */
  async openAccountMenuWithKeyboard(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await this.closeAccountMenu();
    await expect(this.moduleSwitcherTrigger).toBeVisible({ timeout: t(10000) });
    await this.moduleSwitcherTrigger.focus();
    await this.page.keyboard.press('Tab');
    await expect(this.accountTrigger).toBeFocused({ timeout: t(5000) });
    await this.page.keyboard.press('Enter');
    await this.expectAccountMenuOpen();
    await expect.poll(async () => (await this.focusInfo()).inAccountPanel, {
      timeout: t(5000), message: 'focus moved into the opened account menu',
    }).toBe(true);
  }

  /** Inside the open account menu, Tab forward until `pref` has focus. */
  async tabToDesktopOption(pref: Preference): Promise<void> {
    for (let i = 0; i <= APPEARANCE_A11Y.MAX_MENU_TABS; i++) {
      const f = await this.focusInfo();
      if (f.option === pref && f.inDesktopGroup) return;
      await this.page.keyboard.press('Tab');
    }
    throw new Error(`the ${pref} option was not reached in ${APPEARANCE_A11Y.MAX_MENU_TABS} Tab presses inside the account menu`);
  }

  /**
   * 2.4.3, menu open (focus on its first item): Tab goes through the menu and reaches Auto,
   * Light, Dark in that order right after Site Language, then moves on to the next menu item;
   * Shift+Tab comes back to Dark.
   */
  async expectMenuTabOrder(): Promise<void> {
    const stops: FocusInfo[] = [await this.focusInfo()];
    while (stops.length <= APPEARANCE_A11Y.MAX_MENU_TABS && stops[stops.length - 1].option !== 'dark') {
      await this.page.keyboard.press('Tab');
      stops.push(await this.focusInfo());
    }
    const summary = this.summary(stops);
    const a = stops.findIndex((s) => s.option === 'auto');
    expect(a, `Tab reaches Auto inside the menu (${summary})`).toBeGreaterThan(0);
    expect(stops.slice(0, a).every((s) => s.inAccountPanel), `the stops before Auto are in the account menu (${summary})`).toBe(true);
    expect(stops[a - 1].inLanguageToggle, `the stop before Auto is Site Language (${summary})`).toBe(true);
    expect(stops.slice(a).map((s) => s.option), `Auto, Light, Dark in order (${summary})`).toEqual([...PREFERENCES]);
    expect(stops.slice(a).every((s) => s.inDesktopGroup), `the options are in the group (${summary})`).toBe(true);
    await this.expectTabMovesOnFromGroup('desktop');
  }

  /**
   * 2.1.2: Tab from Dark (the last option) moves on to the next item of the same menu, not back
   * into the group; Shift+Tab returns to Dark.
   */
  async expectTabMovesOnFromGroup(surface: Surface): Promise<void> {
    await expect(this.option(surface, 'dark')).toBeFocused({ timeout: t(5000) });
    await this.page.keyboard.press('Tab');
    const next = await this.focusInfo();
    const inGroup = surface === 'desktop' ? next.inDesktopGroup : next.inMobileGroup;
    const inMenu = surface === 'desktop' ? next.inAccountPanel : next.inMobileMenu;
    expect(!!next.focused && !inGroup && !!inMenu, `Tab moved on from Dark to the next menu item (${next.tag}:${next.name})`).toBe(true);
    await this.page.keyboard.press('Shift+Tab');
    await expect(this.option(surface, 'dark')).toBeFocused({ timeout: t(5000) });
  }

  /**
   * 2.1.2: Escape closes the menu. Returns where focus went: back to the account button, to the
   * document, or (the known gap below) still on the item that had it, now hidden in the closed
   * menu. Follow with expectTabLeavesHeader() for the no-trap check.
   *
   * Known gap, not specific to Appearance: DropdownMenu returns focus to `buttonRef`, but the
   * logged-out trigger is a common/Button.jsx `<Button>`, a function component that does not
   * forward refs, so `buttonRef.current` is null and focus stays on the hidden option (seen on the
   * branch build against live HTML, 2026-11-05; the same for every header dropdown). Callers
   * report it instead of failing on it.
   */
  async expectEscapeClosesMenu(): Promise<{ focus: 'account-button' | 'document' | 'hidden-menu-item' | 'elsewhere'; detail: string }> {
    await this.page.keyboard.press('Escape');
    await expect(this.accountPanel).not.toHaveClass(OPEN_CLASS, { timeout: t(5000) });
    const f = await this.focusInfo();
    const focus = f.isAccountTrigger ? 'account-button' : !f.focused ? 'document' : f.inAccountPanel ? 'hidden-menu-item' : 'elsewhere';
    return { focus, detail: `${f.tag}:${f.option ?? f.name}` };
  }

  /**
   * No trap: from the account button (the header's last control), or from wherever a closed menu
   * left focus, the next Tab reaches a control outside the header.
   */
  async expectTabLeavesHeader(): Promise<void> {
    await this.page.keyboard.press('Tab');
    const next = await this.focusInfo();
    expect(!!next.focused && !next.inHeader, `Tab left the header (${next.tag}:${next.name})`).toBe(true);
  }

  /** Mobile: focus the last interface-language control, then Tab to Auto. Returns the presses. */
  async tabToMobileOptionFromLanguageRow(): Promise<number> {
    await this.expectMobileRowVisible();
    await this.page.locator(APPEARANCE_SELECTORS.MOBILE_LANGUAGE_CONTROLS).last().focus();
    for (let i = 1; i <= 4; i++) {
      await this.page.keyboard.press('Tab');
      if ((await this.focusInfo()).option === 'auto') return i;
    }
    throw new Error('Tab from the interface-language row did not reach the Auto option');
  }

  /** Mobile, 2.4.3: from Auto, Tab reaches Light then Dark, then moves on out of the row. */
  async expectMobileTabOrder(): Promise<void> {
    await expect(this.option('mobile', 'auto')).toBeFocused({ timeout: t(5000) });
    for (const pref of PREFERENCES.slice(1)) {
      await this.page.keyboard.press('Tab');
      await expect(this.option('mobile', pref), `Tab reaches ${pref}`).toBeFocused({ timeout: t(5000) });
    }
    await this.expectTabMovesOnFromGroup('mobile');
  }

  async expectOptionFocused(surface: Surface, pref: Preference): Promise<void> {
    await expect(this.option(surface, pref)).toBeFocused({ timeout: t(5000) });
  }

  /** From the option that has focus, Tab / Shift+Tab to `pref` (the options are consecutive stops). */
  async moveFocusToOption(surface: Surface, pref: Preference): Promise<void> {
    const current = (await this.focusInfo()).option as Preference | null;
    expect(current, 'an Appearance option has focus').not.toBeNull();
    const delta = PREFERENCES.indexOf(pref) - PREFERENCES.indexOf(current!);
    for (let i = 0; i < Math.abs(delta); i++) await this.page.keyboard.press(delta > 0 ? 'Tab' : 'Shift+Tab');
    await this.expectOptionFocused(surface, pref);
  }

  /** A keyboard user can see where focus is: body.user-is-tabbing and an outline or a box-shadow ring. */
  async expectFocusRingVisible(): Promise<void> {
    const ring = await this.page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        tabbing: document.body.classList.contains('user-is-tabbing'),
        outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
        shadow: cs.boxShadow !== 'none',
        detail: `outline: ${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}; box-shadow: ${cs.boxShadow}`,
      };
    });
    expect(ring, 'something has focus').not.toBeNull();
    expect(ring!.tabbing, 'body.user-is-tabbing after a Tab key press').toBe(true);
    expect(ring!.outline || ring!.shadow, `visible focus ring (${ring!.detail})`).toBe(true);
  }

  /**
   * Pixel measurement of the focused element's indicator (focused vs unfocused screenshots of its
   * box plus 8px), for rings the computed style cannot describe. Leaves the element focused.
   */
  async focusPixels(): Promise<FocusPixels> {
    const vp = this.page.viewportSize();
    const box = await this.page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      const r = a.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    if (!box || !vp || !box.w || !box.h) return null;
    const x = Math.max(0, Math.floor(box.x - 8)), y = Math.max(0, Math.floor(box.y - 8));
    const clip = { x, y, width: Math.min(vp.width - x, Math.ceil(box.w + 16)), height: Math.min(vp.height - y, Math.ceil(box.h + 16)) };
    if (clip.width <= 0 || clip.height <= 0) return null;
    const focused = (await this.page.screenshot({ clip, animations: 'disabled' })).toString('base64');
    await this.page.evaluate(() => { (window as any).__a11yRefocus = document.activeElement; (document.activeElement as HTMLElement).blur(); });
    const unfocused = (await this.page.screenshot({ clip, animations: 'disabled' })).toString('base64');
    await this.page.evaluate(() => { (window as any).__a11yRefocus.focus(); delete (window as any).__a11yRefocus; });
    return this.page.evaluate(A11Y.compareFocusPixels, { focused, unfocused }) as Promise<FocusPixels>;
  }

  /**
   * 2.4.7 (AA): the focused element shows an indicator, and it reaches `min`:1 against what it is
   * drawn on: by the computed outline colour, or by the pixels that change when focus arrives.
   */
  async expectFocusIndicator(min: number = APPEARANCE_A11Y.MIN_FOCUS_CONTRAST): Promise<{ info: FocusInfo; pixels: FocusPixels }> {
    const info = await this.focusInfo();
    expect(info.focused, 'something has focus').toBe(true);
    const pixels = await this.focusPixels();
    const detail = JSON.stringify({ name: info.name, option: info.option, ring: info.ring, pixels });
    expect(info.ring?.source, `a focus indicator is drawn (${detail})`).not.toBe('none');
    expect(pixels?.changed ?? 0, `focusing changes pixels (${detail})`).toBeGreaterThan(20);
    const byStyle = (info.ring?.contrast ?? 0) >= min;
    const byPixels = (pixels?.p90Contrast ?? 0) >= min && (pixels?.atLeast3 ?? 0) > 20;
    expect(byStyle || byPixels, `focus indicator reaches ${min}:1 (${detail})`).toBe(true);
    return { info, pixels };
  }

  /**
   * 2.4.1: the skip link is the first Tab stop, is on screen with readable text and a focus ring
   * while focused, and Enter moves the sequential-focus point into #main.
   */
  async expectSkipLinkWorks(): Promise<void> {
    await this.focusFromTop();
    await this.page.keyboard.press('Tab');
    await expect(this.skipLink).toBeFocused({ timeout: t(5000) });
    await expect(this.skipLink).toBeInViewport();
    await expect(this.skipLink).toHaveAttribute('href', APPEARANCE_A11Y.MAIN);
    // It slides in (transition: top 0.3s); measure it where it comes to rest.
    await expect.poll(() => this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.getAnimations().length : -1;
    }, APPEARANCE_SELECTORS.SKIP_LINK), { timeout: t(5000), message: 'skip link transition finished' }).toBe(0);
    const text = (await this.page.evaluate(A11Y.scanTextContrast, { roots: [APPEARANCE_SELECTORS.SKIP_LINK] })) as { rows: ScanRow[] };
    const measured = text.rows.filter((r) => r.status !== 'skip');
    expect(measured.length, `skip link text measured (${JSON.stringify(text.rows)})`).toBeGreaterThan(0);
    expect(measured.filter((r) => r.status === 'fail'), JSON.stringify(measured)).toEqual([]);
    await this.expectFocusIndicator();
    await this.page.keyboard.press('Enter');
    await expect(this.page).toHaveURL(/#main$/, { timeout: t(5000) });
    await this.page.keyboard.press('Tab');
    const next = await this.focusInfo();
    expect(next.inHeader, `after the skip link, Tab continues in the main content (${next.tag}:${next.name})`).toBe(false);
  }

  /** The page state the "no change of context" checks compare. */
  async contextState(): Promise<Record<string, unknown>> {
    return this.page.evaluate((sel) => {
      const a = document.activeElement;
      return {
        url: location.href,
        title: document.title,
        lang: document.documentElement.getAttribute('lang'),
        dir: document.documentElement.getAttribute('dir'),
        theme: document.documentElement.getAttribute('data-theme'),
        // One group is mounted after hydration (the desktop menu's or the drawer's).
        pressed: Array.from(document.querySelectorAll(`${sel.OPTION}[aria-pressed="true"]`)).map((e) => e.getAttribute('data-appearance')),
        accountMenuOpen: Array.from(document.querySelectorAll(sel.OPEN_ACCOUNT_PANEL)).some((m) => !!m.closest(sel.ACCOUNT_MENU)),
        mobileMenuOpen: !!document.querySelector(sel.MOBILE_MENU_OPEN),
        // Identity, not className: the pressed option gains the `active` class.
        focus: a && a !== document.body
          ? [a.tagName.toLowerCase(), a.getAttribute('data-appearance'), a.getAttribute('aria-label'), a.id].join('|')
          : null,
      };
    }, APPEARANCE_SELECTORS);
  }

  /**
   * 2.1.1 / 3.2.2 / 3.1.1: pressing `key` on the focused option chooses it, shows `theme`, and
   * changes nothing else: same URL, title, lang and dir, no page load, focus stays on the option,
   * and the menu (desktop) or drawer (mobile) stays open.
   */
  async expectKeyChoosesInPlace(surface: Surface, key: 'Enter' | 'Space', theme: ThemeName): Promise<void> {
    const pref = (await this.focusInfo()).option as Preference | null;
    expect(pref, `an Appearance option has focus before ${key}`).not.toBeNull();
    const loads = this.trackDocumentLoads();
    const before = await this.contextState();
    expect(before.pressed, `${pref} is not already pressed`).not.toEqual([pref]);
    await this.page.keyboard.press(key);
    await expect(this.option(surface, pref!)).toHaveAttribute('aria-pressed', 'true', { timeout: t(5000) });
    await expect(this.html).toHaveAttribute(APPEARANCE.ATTR, theme, { timeout: t(5000) });
    const after = await this.contextState();
    const same = (o: Record<string, unknown>) => ({
      url: o.url, title: o.title, lang: o.lang, dir: o.dir, focus: o.focus, accountMenuOpen: o.accountMenuOpen, mobileMenuOpen: o.mobileMenuOpen,
    });
    expect(same(after), `${key} changed only the appearance`).toEqual(same(before));
    expect(after.pressed, 'exactly one option pressed').toEqual([pref]);
    expect(loads(), 'no document load').toBe(0);
  }

  /** 3.2.1: moving focus onto each option (menu open) changes nothing. */
  async expectFocusAloneChangesNothing(surface: Surface): Promise<void> {
    const before = await this.contextState();
    for (const pref of PREFERENCES) {
      const o = this.option(surface, pref);
      await o.focus();
      await expect(o).toBeFocused();
    }
    const after = await this.contextState();
    expect({ ...after, focus: null }, 'focusing the options changed the page').toEqual({ ...before, focus: null });
  }

  /** 2.1.4: single character keys never change the appearance. */
  async expectCharacterKeysDoNothing(): Promise<void> {
    const before = await this.contextState();
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const k of APPEARANCE_A11Y.CHARACTER_KEYS) await this.page.keyboard.press(k);
    const after = await this.contextState();
    expect([after.theme, after.pressed, after.url]).toEqual([before.theme, before.pressed, before.url]);
  }

  /** Text contrast of every visible text node's element under `roots` (see a11y-scan.js). */
  async contrastScan(roots: readonly string[] = APPEARANCE_A11Y.SCAN_PAGE): Promise<ScanRow[]> {
    await this.page.evaluate(() => document.fonts && document.fonts.ready);
    const res = (await this.page.evaluate(A11Y.scanTextContrast, { roots: [...roots] })) as { rows: ScanRow[] };
    return res.rows;
  }

  /** 1.4.3: no measured text below 4.5:1 (3:1 large). Attaches the full scan to the report. */
  async expectTextContrast(testInfo: TestInfo, label: string, roots: readonly string[] = APPEARANCE_A11Y.SCAN_PAGE, minMeasured = 5): Promise<void> {
    const rows = await this.contrastScan(roots);
    await testInfo.attach(`contrast-${label}.json`, { body: JSON.stringify(rows, null, 1), contentType: 'application/json' });
    const measured = rows.filter((r) => r.status !== 'skip');
    expect(measured.length, `${label}: text found to measure`).toBeGreaterThan(minMeasured);
    const fails = measured.filter((r) => r.status === 'fail').map((r) => `${r.ratio}:1 < ${r.min} ${r.fg} on ${r.bg} ${r.selector} "${r.text}"`);
    expect(fails, `${label}: text below the WCAG 1.4.3 minimum`).toEqual([]);
  }

  /** Light-mode baseline: the same scan, reported as an annotation and attachment, never failing. */
  async reportTextContrast(testInfo: TestInfo, label: string, roots: readonly string[] = APPEARANCE_A11Y.SCAN_PAGE): Promise<number> {
    const rows = await this.contrastScan(roots);
    const fails = rows.filter((r) => r.status === 'fail');
    await testInfo.attach(`contrast-${label}.json`, { body: JSON.stringify(rows, null, 1), contentType: 'application/json' });
    testInfo.annotations.push({
      type: 'light-baseline',
      description: `${label}: ${fails.length} of ${rows.filter((r) => r.status !== 'skip').length} text elements below the minimum` +
        (fails.length ? ': ' + fails.slice(0, 5).map((r) => `${r.ratio}:1 "${r.text}"`).join('; ') : ''),
    });
    return fails.length;
  }

  /** 1.4.1: links in running text are underlined or at least 3:1 from the text around them. */
  async inlineLinks(roots: readonly string[] = APPEARANCE_A11Y.RUNNING_TEXT_ROOTS): Promise<Array<Record<string, unknown>>> {
    return (await this.page.evaluate(A11Y.scanInlineLinks, { roots: [...roots] })) as Array<Record<string, unknown>>;
  }

  async expectInlineLinksDistinguishable(roots: readonly string[] = APPEARANCE_A11Y.RUNNING_TEXT_ROOTS): Promise<number> {
    await expect.poll(async () => (await this.inlineLinks(roots)).length, { timeout: t(15000), message: 'links in running text rendered' }).toBeGreaterThan(0);
    const rows = await this.inlineLinks(roots);
    expect(rows.filter((r) => r.status === 'fail'), JSON.stringify(rows, null, 1)).toEqual([]);
    return rows.length;
  }

  /** 4.1.1: no id is used twice, inside `scope` (checked against the whole document). */
  async expectNoDuplicateIds(scope: string | null = null): Promise<void> {
    expect(await this.page.evaluate(A11Y.duplicateIds, scope), `duplicate ids${scope ? ` in ${scope}` : ''}`).toEqual([]);
  }

  /**
   * axe-core with the WCAG 2.0/2.1 A and AA tags, when axe-core is installed (it is not a repo
   * dependency: set AXE_CORE_PATH or install it locally). Returns null without it.
   */
  async runAxe(include: readonly string[] | null = null): Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[]; html: string }> }> } | null> {
    const axe = A11Y.axeSource();
    if (!axe) return null;
    if (!(await this.page.evaluate(() => typeof (window as any).axe === 'object'))) await this.page.addScriptTag({ content: axe.source });
    return this.page.evaluate(async ({ include, tags }) => {
      const ctx = include ? { include: include.filter((s: string) => document.querySelector(s)).map((s: string) => [s]) } : document;
      const r = await (window as any).axe.run(ctx, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
      return { violations: r.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.map((n: any) => ({ target: n.target, html: n.html.slice(0, 160) })) })) };
    }, { include: include ? [...include] : null, tags: A11Y.AXE_TAGS });
  }
}
