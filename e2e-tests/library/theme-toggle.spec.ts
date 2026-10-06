/*
 * PURPOSE: Dark-mode theme toggle on the desktop header (Library module, plus the
 * Library <-> Voices hand-off).
 *
 * Contract under test (see pages/themeTogglePage.ts for selectors and details):
 *   - the server renders <html data-theme> from the `theme` cookie; light unless the
 *     cookie is exactly `dark` (there is no OS-following mode);
 *   - `button.themeToggle` sits in `.header-icons` between the module switcher and the
 *     account menu, for logged-out and logged-in users; aria-pressed; name "Dark mode";
 *   - toggling writes one parent-domain `theme` cookie, updates <meta name="theme-color">,
 *     fires the `theme_toggle` analytics event, and never reloads the page.
 *
 * Test IDs: THEME-D0xx. Mobile coverage lives in "mobile web/theme-toggle.spec.ts"
 * (THEME-M0xx). Header tab order including the toggle is MOD-H009a (header.spec.ts).
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import {
  THEME,
  THEME_CONTRAST_SELECTORS,
  blockClientBundle,
  installAnalyticsCapture,
  installPaintProbe,
  seedThemeCookie,
} from '../pages/themeTogglePage';

const LIBRARY = MODULE_URLS.EN.LIBRARY;
const VOICES = MODULE_URLS.EN.VOICES;
const TEXTS = `${LIBRARY}${THEME.PATHS.TEXTS}`;
const READER = `${LIBRARY}${THEME.PATHS.READER}`;

// Library <-> Voices share the theme cookie only when both hosts sit under one parent
// domain. A localhost sandbox writes a host-only cookie (voices.localhost is another
// host), so the hand-off cannot be exercised there.
const LOCAL_SANDBOX = /^(https?:\/\/)?(localhost|127\.0\.0\.1)/.test(process.env.SANDBOX_URL ?? '');

// ---------------------------------------------------------------------------
// Toggle behavior — anonymous, English
// ---------------------------------------------------------------------------

test.describe('Library Theme Toggle — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await installAnalyticsCapture(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D001: toggle sits between the module switcher and the account menu; light by default', async () => {
    await pm.onThemeToggle().expectDesktopTogglePlacement();
    await pm.onThemeToggle().expectDesktopPressed(false);
    await pm.onThemeToggle().expectTheme('light');
    await pm.onThemeToggle().expectThemeCookie(null);
  });

  test('THEME-D002: clicking switches to dark and back: data-theme, cookie, theme-color, analytics, no reload', async () => {
    const lightThemeColor = await pm.onThemeToggle().getThemeColor();
    expect(lightThemeColor, 'server-rendered theme-color').toBeTruthy();
    const documentLoads = pm.onThemeToggle().trackDocumentLoads();

    await pm.onThemeToggle().toggleDesktopTo('dark');
    await pm.onThemeToggle().expectThemeCookie('dark');
    await pm.onThemeToggle().expectThemeColor(THEME.DARK_THEME_COLOR);
    await pm.onThemeToggle().expectThemeToggleEventCount(1);

    await pm.onThemeToggle().toggleDesktopTo('light');
    await pm.onThemeToggle().expectThemeCookie('light');
    await pm.onThemeToggle().expectThemeColor(lightThemeColor!);
    await pm.onThemeToggle().expectThemeToggleEventCount(2);

    expect(documentLoads(), 'toggling must not reload the page').toBe(0);
  });

  test('THEME-D003: dark persists across reload, in-app navigation and a full page load', async () => {
    await pm.onThemeToggle().toggleDesktopTo('dark');

    await pm.onThemeToggle().reload();
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectDesktopPressed(true);

    // In-app (client-side) navigation through the header.
    await pm.onModuleHeader().clickAndVerifyNavigation('Topics', /\/topics/);
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectDesktopPressed(true);

    // Full, server-rendered page load of a reader page.
    await pm.onThemeToggle().goto(READER);
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectDesktopPressed(true);
    await pm.onThemeToggle().expectThemeCookie('dark');
  });

  test('THEME-D004: keyboard: Tab reaches the toggle after the module switcher; Space and Enter toggle it', async () => {
    await pm.onThemeToggle().focusModuleSwitcher();
    await pm.onThemeToggle().press('Tab');
    await pm.onThemeToggle().expectDesktopToggleFocused();
    await pm.onThemeToggle().expectDesktopFocusIndicatorVisible();

    await pm.onThemeToggle().press('Space');
    await pm.onThemeToggle().expectDesktopPressed(true);
    await pm.onThemeToggle().expectTheme('dark');
    // Focus survives the re-render (icon swap) and stays visible on the dark header.
    await pm.onThemeToggle().expectDesktopToggleFocused();
    await pm.onThemeToggle().expectDesktopFocusIndicatorVisible();

    await pm.onThemeToggle().press('Enter');
    await pm.onThemeToggle().expectDesktopPressed(false);
    await pm.onThemeToggle().expectTheme('light');
    await pm.onThemeToggle().expectDesktopToggleFocused();

    // Neighbors in the tab sequence: account menu next, back to the toggle with Shift+Tab.
    await pm.onThemeToggle().press('Tab');
    await pm.onThemeToggle().expectAccountMenuFocused();
    await pm.onThemeToggle().press('Shift+Tab');
    await pm.onThemeToggle().expectDesktopToggleFocused();
  });

  test('THEME-D005: /texts contrast spot checks pass in both themes (text 4.5:1, toggle icon 3:1)', async () => {
    await pm.onThemeToggle().expectContrast(THEME_CONTRAST_SELECTORS.TEXTS_PAGE);
    await pm.onThemeToggle().expectDesktopToggleIconContrast();

    await pm.onThemeToggle().toggleDesktopTo('dark');
    await pm.onThemeToggle().expectContrast(THEME_CONTRAST_SELECTORS.TEXTS_PAGE);
    await pm.onThemeToggle().expectDesktopToggleIconContrast();
  });

  test('THEME-D006: reader page contrast spot checks pass in both themes', async () => {
    await pm.onThemeToggle().goto(READER);
    await pm.onThemeToggle().expectContrast(THEME_CONTRAST_SELECTORS.READER_PAGE);

    await pm.onThemeToggle().toggleDesktopTo('dark');
    await pm.onThemeToggle().expectContrast(THEME_CONTRAST_SELECTORS.READER_PAGE);
    await pm.onThemeToggle().expectDesktopToggleIconContrast();
  });

  test('THEME-D007: an OS dark preference without a theme cookie still renders light', async () => {
    await pm.onThemeToggle().emulateOsDarkPreference();
    await pm.onThemeToggle().reload();
    await pm.onThemeToggle().expectPrefersDarkEmulated();
    await pm.onThemeToggle().expectTheme('light');
    await pm.onThemeToggle().expectDesktopPressed(false);
    await pm.onThemeToggle().expectThemeCookie(null);
  });
});

// ---------------------------------------------------------------------------
// First paint — the dark cookie is set before the first request
// ---------------------------------------------------------------------------

test.describe('Library Theme Toggle — first paint with a dark cookie (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, LIBRARY, THEME.DARK);
    await installPaintProbe(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D008: no light flash: dark at DOMContentLoaded and at the first frame, on load and reload', async () => {
    await pm.onThemeToggle().expectNoFlash('dark');
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectDesktopPressed(true);
    await pm.onThemeToggle().expectThemeColor(THEME.DARK_THEME_COLOR);

    await pm.onThemeToggle().reload();
    await pm.onThemeToggle().expectNoFlash('dark');

    await pm.onThemeToggle().goto(READER);
    await pm.onThemeToggle().expectNoFlash('dark');
  });

  test('THEME-D009: invalid theme cookie values render light and are not echoed into the page', async ({ context }) => {
    for (const value of [...THEME.INVALID_COOKIE_VALUES, THEME.UNECHOED_COOKIE_VALUE]) {
      await seedThemeCookie(context, LIBRARY, value);
      await pm.onThemeToggle().reload();
      await pm.onThemeToggle().expectNoFlash('light');
      await pm.onThemeToggle().expectTheme('light');
      await pm.onThemeToggle().expectDesktopPressed(false);
    }
    await pm.onThemeToggle().expectMarkupExcludes(THEME.UNECHOED_COOKIE_VALUE);
  });
});

// ---------------------------------------------------------------------------
// Server rendering — no client bundle, then no JavaScript at all
// ---------------------------------------------------------------------------

test.describe('Library Theme Toggle — client bundle blocked (English)', () => {
  let page: Page;
  let pm: PageManager;
  let bundle: { blocked: string[] };

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, LIBRARY, THEME.DARK);
    bundle = await blockClientBundle(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D010: server HTML and the head script alone render dark', async () => {
    expect(bundle.blocked.length, 'the client bundle request was intercepted').toBeGreaterThan(0);
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectServerRenderedDesktopPressed(true);
    await pm.onThemeToggle().expectThemeColor(THEME.DARK_THEME_COLOR);
  });
});

test.describe('Library Theme Toggle — JavaScript disabled (English)', () => {
  test.use({ javaScriptEnabled: false });

  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, LIBRARY, THEME.DARK);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D011: the server alone renders dark from the cookie, and light without it', async () => {
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectServerRenderedDesktopPressed(true);
    await pm.onThemeToggle().expectThemeColor(THEME.DARK_THEME_COLOR);

    await pm.onThemeToggle().clearThemeCookie();
    await pm.onThemeToggle().reload();
    await pm.onThemeToggle().expectTheme('light');
    await pm.onThemeToggle().expectServerRenderedDesktopPressed(false);
  });
});

// ---------------------------------------------------------------------------
// Library <-> Voices
// ---------------------------------------------------------------------------

test.describe('Library Theme Toggle — Library and Voices share the choice (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    test.skip(LOCAL_SANDBOX, 'localhost writes a host-only cookie, so www and voices cannot share it');
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D012: dark chosen on Library shows on Voices; light chosen on Voices shows on Library', async () => {
    await pm.onThemeToggle().toggleDesktopTo('dark');

    await pm.onThemeToggle().goto(VOICES);
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectDesktopTogglePlacement();
    await pm.onThemeToggle().expectDesktopPressed(true);

    await pm.onThemeToggle().toggleDesktopTo('light');
    await pm.onThemeToggle().goto(TEXTS);
    await pm.onThemeToggle().expectTheme('light');
    await pm.onThemeToggle().expectDesktopPressed(false);
    await pm.onThemeToggle().expectThemeCookie('light');
  });
});

// ---------------------------------------------------------------------------
// Logged in
// ---------------------------------------------------------------------------

test.describe('Library Theme Toggle — Logged In', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, TEXTS, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D013: toggle sits before the avatar; the choice persists and stays cookie-only', async () => {
    await expect(pm.onModuleHeader().isLoggedIn()).resolves.toBe(true);
    await pm.onThemeToggle().expectDesktopTogglePlacement();
    await pm.onThemeToggle().expectDesktopPressed(false);

    const profileWrites = pm.onThemeToggle().trackProfileWrites();
    await pm.onThemeToggle().toggleDesktopTo('dark');
    await pm.onThemeToggle().expectThemeCookie('dark');
    await pm.onThemeToggle().reload();
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectDesktopPressed(true);
    expect(profileWrites(), 'v1 stores the theme in the cookie only').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hebrew interface (.org.il)
// ---------------------------------------------------------------------------

test.describe('Library Theme Toggle — Hebrew', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}${THEME.PATHS.TEXTS}`, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
  });

  test('THEME-D014: Hebrew label "מצב כהה", RTL placement, and the cookie on the Hebrew domain', async () => {
    await pm.onThemeToggle().expectDesktopTogglePlacement();
    await pm.onThemeToggle().expectDesktopPressed(false);

    await pm.onThemeToggle().toggleDesktopTo('dark');
    await pm.onThemeToggle().expectThemeCookie('dark');
    await pm.onThemeToggle().reload();
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectDesktopPressed(true);
  });
});
