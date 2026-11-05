/*
 * PURPOSE: the Appearance setting (Auto / Light / Dark) in the desktop account menu (Library
 * module, plus the Library <-> Voices hand-off).
 *
 * Contract under test (see pages/appearancePage.ts for selectors and details):
 *   - the `theme` cookie holds the preference (auto | light | dark; none or invalid = auto);
 *     <html data-theme> shows light | dark;
 *   - light / dark: the server renders data-theme and theme-color in the first byte; auto: the
 *     server renders no data-theme and the head script picks from prefers-color-scheme before any
 *     stylesheet, and the page follows live system changes; light / dark ignore the system;
 *   - no theme button in the header: the account menu (logged out and logged in) holds the
 *     "Appearance" group right after Site Language, three aria-pressed buttons, exactly one
 *     pressed; choosing keeps the menu open, writes one shared-domain SameSite=Lax cookie,
 *     updates theme-color, fires `appearance_change`, and never reloads the page.
 *
 * Test IDs (THEME-D0xx):
 *   D001 placement, defaults        D007 /texts + menu contrast   D013 explicit light on a dark system
 *   D002 choose each mode           D008 reader contrast          D014 client bundle blocked
 *   D003 persistence                D009 desktop <-> mobile sync  D015 JavaScript disabled
 *   D004 light/dark ignore the OS   D010 first paint, dark cookie D016 Library <-> Voices
 *   D005 auto follows the OS live   D011 invalid cookies = auto   D017 logged in
 *   D006 keyboard                   D012 first paint, auto + dark system (new context)
 *   D018 Hebrew
 * Mobile: "mobile web/appearance.spec.ts" (THEME-M0xx). WCAG checks: appearance-a11y.spec.ts
 * (THEME-A0xx). Header tab order without a theme control: MOD-H009a (header.spec.ts).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import {
  APPEARANCE,
  APPEARANCE_CONTRAST_SELECTORS,
  blockClientBundle,
  installAnalyticsCapture,
  installPaintProbe,
  seedThemeCookie,
} from '../pages/appearancePage';

const LIBRARY = MODULE_URLS.EN.LIBRARY;
const VOICES = MODULE_URLS.EN.VOICES;
const TEXTS = `${LIBRARY}${APPEARANCE.PATHS.TEXTS}`;
const READER = `${LIBRARY}${APPEARANCE.PATHS.READER}`;

// Library <-> Voices share the theme cookie only when both hosts sit under one parent domain.
// A localhost sandbox writes a host-only cookie (voices.localhost is another host), so the
// hand-off cannot be exercised there. Cauldrons (www. / voices.<name>.cauldron.sefaria.org) can.
const LOCAL_SANDBOX = /^(https?:\/\/)?(localhost|127\.0\.0\.1)/.test(process.env.SANDBOX_URL ?? '');

// ---------------------------------------------------------------------------
// Behaviour — anonymous, English, light system (Playwright's default colour scheme)
// ---------------------------------------------------------------------------

test.describe('Library Appearance — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await installAnalyticsCapture(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D001: no header button; Appearance follows Site Language in the account menu; Auto by default', async () => {
    await pm.onAppearance().expectNoHeaderThemeButton();
    await pm.onAppearance().expectDesktopPlacement();
    await pm.onAppearance().expectDesktopPressed('auto');
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectThemeCookie(null);
    await pm.onAppearance().expectServerRendered(null);
  });

  test('THEME-D002: choosing Dark, Light and Auto: data-theme, theme-color, cookie, analytics, menu stays open, no reload', async () => {
    const documentLoads = pm.onAppearance().trackDocumentLoads();

    // The pressed option is a no-op: no event, no cookie.
    await pm.onAppearance().chooseDesktop('auto');
    await pm.onAppearance().settle();
    await pm.onAppearance().expectAppearanceEventCount(0);
    await pm.onAppearance().expectThemeCookie(null);

    await pm.onAppearance().selectDesktop('dark', 'dark');
    await pm.onAppearance().expectAccountMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('dark');
    await pm.onAppearance().expectThemeColorFor('dark');
    await pm.onAppearance().expectAppearanceEventCount(1);
    await pm.onAppearance().expectLastAppearanceEvent('desktop', { from: 'auto', to: 'dark', theme: 'dark' });

    await pm.onAppearance().selectDesktop('light', 'light');
    await pm.onAppearance().expectAccountMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('light');
    await pm.onAppearance().expectThemeColorFor('light');
    await pm.onAppearance().expectAppearanceEventCount(2);
    await pm.onAppearance().expectLastAppearanceEvent('desktop', { from: 'dark', to: 'light', theme: 'light' });

    await pm.onAppearance().selectDesktop('auto', 'light');
    await pm.onAppearance().expectAccountMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('auto');
    await pm.onAppearance().expectThemeColorFor('light');
    await pm.onAppearance().expectAppearanceEventCount(3);
    await pm.onAppearance().expectLastAppearanceEvent('desktop', { from: 'light', to: 'auto', theme: 'light' });

    expect(documentLoads(), 'choosing must not reload the page').toBe(0);
  });

  test('THEME-D003: Dark and Light persist across reload (server-rendered), in-app navigation and a full page load', async () => {
    await pm.onAppearance().selectDesktop('dark', 'dark');

    await pm.onAppearance().reload();
    await pm.onAppearance().expectServerRendered('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectDesktopPressed('dark');
    await pm.onAppearance().closeAccountMenu();

    // In-app (client-side) navigation through the header.
    await pm.onModuleHeader().clickAndVerifyNavigation('Topics', /\/topics/);
    await pm.onAppearance().expectTheme('dark');

    // Full, server-rendered page load of a reader page.
    await pm.onAppearance().goto(READER);
    await pm.onAppearance().expectServerRendered('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeCookie('dark');

    await pm.onAppearance().selectDesktop('light', 'light');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectServerRendered('light');
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectDesktopPressed('light');
  });

  test('THEME-D004: explicit Light and Dark ignore the system setting, live and from the first paint', async ({ context }) => {
    await installPaintProbe(context);

    await pm.onAppearance().emulateSystemTheme('dark');
    await pm.onAppearance().selectDesktop('light', 'light');
    await pm.onAppearance().expectThemeStays('light');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectNoFlash('light');
    await pm.onAppearance().expectServerRendered('light');
    await pm.onAppearance().expectTheme('light');

    await pm.onAppearance().emulateSystemTheme('light');
    await pm.onAppearance().selectDesktop('dark', 'dark');
    await pm.onAppearance().emulateSystemTheme('dark');
    await pm.onAppearance().emulateSystemTheme('light');
    await pm.onAppearance().expectThemeStays('dark');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectNoFlash('dark');
    await pm.onAppearance().expectDesktopPressed('dark');
  });

  test('THEME-D005: Auto follows a live system change without a reload; choosing Auto adopts the system theme', async () => {
    const documentLoads = pm.onAppearance().trackDocumentLoads();

    await pm.onAppearance().emulateSystemTheme('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeColorFor('dark');
    await pm.onAppearance().expectDesktopPressed('auto');
    await pm.onAppearance().expectThemeCookie(null);

    await pm.onAppearance().emulateSystemTheme('light');
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectThemeColorFor('light');

    // From an explicit choice back to Auto on a dark system.
    await pm.onAppearance().selectDesktop('light', 'light');
    await pm.onAppearance().emulateSystemTheme('dark');
    await pm.onAppearance().expectThemeStays('light');
    await pm.onAppearance().selectDesktop('auto', 'dark');
    await pm.onAppearance().expectThemeCookie('auto');
    await pm.onAppearance().emulateSystemTheme('light');
    await pm.onAppearance().expectTheme('light');

    expect(documentLoads(), 'following the system must not reload the page').toBe(0);
  });

  test('THEME-D006: keyboard: Tab reaches the options after Site Language; Space and Enter choose; focus stays; Escape closes', async () => {
    await pm.onAppearance().openAccountMenuWithKeyboard();
    await pm.onAppearance().tabToDesktopOption('dark');
    await pm.onAppearance().expectFocusRingVisible();

    await pm.onAppearance().press('Space');
    await pm.onAppearance().expectDesktopPressed('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectOptionFocused('desktop', 'dark');
    await pm.onAppearance().expectFocusRingVisible();

    await pm.onAppearance().press('Shift+Tab');
    await pm.onAppearance().press('Enter');
    await pm.onAppearance().expectDesktopPressed('light');
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectOptionFocused('desktop', 'light');

    await pm.onAppearance().press('Shift+Tab');
    await pm.onAppearance().press('Enter');
    await pm.onAppearance().expectDesktopPressed('auto');
    await pm.onAppearance().expectOptionFocused('desktop', 'auto');
    await pm.onAppearance().expectAccountMenuStillOpen();

    await pm.onAppearance().expectEscapeClosesMenu();
  });

  test('THEME-D007: /texts and account menu contrast pass in both themes (text 4.5:1, option chip and icons 3:1)', async () => {
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.TEXTS_PAGE);
    await pm.onAppearance().openAccountMenu();
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.ACCOUNT_MENU);
    await pm.onAppearance().expectOptionContrast('desktop');

    await pm.onAppearance().selectDesktop('dark', 'dark');
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.ACCOUNT_MENU);
    await pm.onAppearance().expectOptionContrast('desktop');
    await pm.onAppearance().closeAccountMenu();
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.TEXTS_PAGE);
  });

  test('THEME-D008: reader page contrast spot checks pass in both themes', async () => {
    await pm.onAppearance().goto(READER);
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.READER_PAGE);

    await pm.onAppearance().selectDesktop('dark', 'dark');
    await pm.onAppearance().closeAccountMenu();
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.READER_PAGE);
  });

  test('THEME-D009: the account menu and the hamburger row stay in sync across a window resize', async () => {
    await pm.onAppearance().selectDesktop('dark', 'dark');
    await pm.onAppearance().closeAccountMenu();

    // Below 843px the Header swaps to the mobile header; its drawer shows the same choice.
    const wide = await pm.onAppearance().narrowWindow();
    await pm.onMobileHamburger().openMenuWithMouse();
    await pm.onAppearance().expectMobilePressed('dark');
    await pm.onAppearance().selectMobile('auto', 'light');
    await pm.onAppearance().expectMobileMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('auto');

    await pm.onAppearance().restoreWindow(wide);
    await pm.onAppearance().expectDesktopPressed('auto');
    await pm.onAppearance().expectTheme('light');
  });
});

// ---------------------------------------------------------------------------
// First paint — a dark cookie is set before the first request
// ---------------------------------------------------------------------------

test.describe('Library Appearance — first paint with a dark cookie (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, LIBRARY, 'dark');
    await installPaintProbe(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D010: no light flash: dark in the first byte, at DOMContentLoaded and the first frame, on load and reload', async () => {
    await pm.onAppearance().expectNoFlash('dark');
    await pm.onAppearance().expectServerRendered('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeColorFor('dark');
    await pm.onAppearance().expectDesktopPressed('dark');

    await pm.onAppearance().reload();
    await pm.onAppearance().expectNoFlash('dark');

    await pm.onAppearance().goto(READER);
    await pm.onAppearance().expectNoFlash('dark');
  });

  test('THEME-D011: invalid cookie values mean Auto (follow the system), and are never echoed into the page', async ({ context }) => {
    const cases = [...APPEARANCE.INVALID_COOKIE_CASES, { value: APPEARANCE.UNECHOED_COOKIE_VALUE, system: 'light' as const }];
    for (const { value, system } of cases) {
      await seedThemeCookie(context, LIBRARY, value);
      await pm.onAppearance().emulateSystemTheme(system);
      await pm.onAppearance().reload();
      await pm.onAppearance().expectNoFlash(system);
      await pm.onAppearance().expectServerRendered(null);
      await pm.onAppearance().expectTheme(system);
      await pm.onAppearance().expectDesktopPressed('auto');
      await pm.onAppearance().closeAccountMenu();
    }
    await pm.onAppearance().expectMarkupExcludes(APPEARANCE.UNECHOED_COOKIE_VALUE);
  });
});

// ---------------------------------------------------------------------------
// First paint — Auto on a dark system: a brand-new context with no cookie
// ---------------------------------------------------------------------------

test.describe('Library Appearance — first paint, Auto with a dark system (English)', () => {
  test.use({ colorScheme: 'dark' });

  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await installPaintProbe(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D012: the head script picks dark before CSS (no light flash); the server sent no data-theme', async () => {
    await pm.onAppearance().expectSystemTheme('dark');
    await pm.onAppearance().expectNoFlash('dark');
    await pm.onAppearance().expectServerRendered(null);
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeColorFor('dark');
    await pm.onAppearance().expectThemeCookie(null);
    await pm.onAppearance().expectDesktopPressed('auto');
    await pm.onAppearance().closeAccountMenu();

    await pm.onAppearance().reload();
    await pm.onAppearance().expectNoFlash('dark');

    await pm.onAppearance().emulateSystemTheme('light');
    await pm.onAppearance().expectTheme('light');
  });

  test('THEME-D013: an explicit Light cookie renders light from the first paint on a dark system', async ({ context }) => {
    await seedThemeCookie(context, LIBRARY, 'light');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectNoFlash('light');
    await pm.onAppearance().expectServerRendered('light');
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectDesktopPressed('light');
  });
});

// ---------------------------------------------------------------------------
// Server rendering — no client bundle, then no JavaScript at all
// ---------------------------------------------------------------------------

test.describe('Library Appearance — client bundle blocked (English)', () => {
  let page: Page;
  let pm: PageManager;
  let bundle: { blocked: string[] };

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, LIBRARY, 'dark');
    bundle = await blockClientBundle(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D014: server HTML and the head script alone render dark, Auto (from the system) and light', async ({ context }) => {
    expect(bundle.blocked.length, 'the client bundle request was intercepted').toBeGreaterThan(0);
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectServerRenderedPressed('dark');
    await pm.onAppearance().expectThemeColorFor('dark');

    await seedThemeCookie(context, LIBRARY, 'auto');
    await pm.onAppearance().emulateSystemTheme('dark');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectServerRendered(null);
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeColorFor('dark');
    await pm.onAppearance().expectServerRenderedPressed('auto');

    await seedThemeCookie(context, LIBRARY, 'light');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectServerRenderedPressed('light');
  });
});

test.describe('Library Appearance — JavaScript disabled (English)', () => {
  test.use({ javaScriptEnabled: false });

  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, LIBRARY, 'dark');
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D015: the server alone renders dark and light from the cookie; Auto has no data-theme and shows light', async ({ context }) => {
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectServerRenderedPressed('dark');
    await pm.onAppearance().expectThemeColorFor('dark');

    await seedThemeCookie(context, LIBRARY, 'light');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectServerRenderedPressed('light');

    // Without JavaScript nothing can read the system setting, so Auto falls back to the CSS default.
    await pm.onAppearance().clearThemeCookie();
    await pm.onAppearance().reload();
    await pm.onAppearance().expectNoThemeAttribute();
    await pm.onAppearance().expectPageBackground('light');
    await pm.onAppearance().expectServerRenderedPressed('auto');
  });
});

// ---------------------------------------------------------------------------
// Library <-> Voices
// ---------------------------------------------------------------------------

test.describe('Library Appearance — Library and Voices share the choice (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    test.skip(LOCAL_SANDBOX, 'localhost writes a host-only cookie, so www and voices cannot share it');
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D016: Dark chosen on Library shows on Voices; Auto chosen on Voices shows on Library', async () => {
    await pm.onAppearance().selectDesktop('dark', 'dark');

    await pm.onAppearance().goto(VOICES);
    await pm.onAppearance().expectServerRendered('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectDesktopPlacement();
    await pm.onAppearance().expectDesktopPressed('dark');

    await pm.onAppearance().selectDesktop('auto', 'light');
    await pm.onAppearance().goto(TEXTS);
    await pm.onAppearance().expectServerRendered(null);
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectDesktopPressed('auto');
    await pm.onAppearance().expectThemeCookie('auto');
  });
});

// ---------------------------------------------------------------------------
// Logged in
// ---------------------------------------------------------------------------

test.describe('Library Appearance — Logged In', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, TEXTS, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D017: the avatar menu has Appearance after Site Language; the choice persists and stays cookie-only', async () => {
    await expect(pm.onModuleHeader().isLoggedIn()).resolves.toBe(true);
    await pm.onAppearance().expectNoHeaderThemeButton();
    await pm.onAppearance().expectDesktopPlacement();
    await pm.onAppearance().expectDesktopPressed('auto');

    const profileWrites = pm.onAppearance().trackProfileWrites();
    await pm.onAppearance().selectDesktop('dark', 'dark');
    await pm.onAppearance().expectAccountMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('dark');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectServerRendered('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectDesktopPressed('dark');
    expect(profileWrites(), 'the preference lives in the cookie only').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hebrew interface
// ---------------------------------------------------------------------------

test.describe('Library Appearance — Hebrew', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}${APPEARANCE.PATHS.TEXTS}`, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D018: Hebrew names (מראה: אוטומטי / בהיר / כהה), RTL order, and the cookie on the Hebrew site', async () => {
    await pm.onAppearance().expectDesktopPlacement();
    await pm.onAppearance().expectDesktopPressed('auto');

    await pm.onAppearance().selectDesktop('dark', 'dark');
    await pm.onAppearance().expectAccountMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('dark');
    await pm.onAppearance().reload();
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectDesktopPressed('dark');
  });
});
