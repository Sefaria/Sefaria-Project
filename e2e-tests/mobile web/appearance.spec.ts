/*
 * PURPOSE: the Appearance setting (Auto / Light / Dark) in the mobile hamburger menu (Library
 * module).
 *
 * Renders against the mobile viewport configured in `playwright.mobileweb.config.ts` (Pixel 5
 * 393 x 851, iPhone 13). On mobile the setting is NOT in the top bar: it is a labelled
 * `role="group"` row (`.mobileAppearanceToggle`) in the drawer's `.mobileAccountLinks`, right
 * after the interface-language row, with three aria-pressed buttons; tapping one leaves the
 * drawer open. Selectors and the full contract live in pages/appearancePage.ts.
 *
 * Test IDs (THEME-M0xx):
 *   M001 not in the top bar; drawer row after the language row; Auto by default; target size
 *   M002 tapping Dark, Light, Auto: data-theme, theme-color, cookie, analytics, drawer open
 *   M003 Dark persists across reload, drawer navigation and a full load
 *   M004 drawer text and option chip contrast in both themes
 *   M005 Auto follows a live system change; explicit Light ignores it
 *   M006 first paint with a dark cookie: no flash
 *   M007 first paint, Auto on a dark system (new context, no cookie): no flash
 *   M008 logged in
 *   M009 Hebrew
 * Desktop coverage (server rendering, JS disabled, Voices hand-off, desktop <-> mobile sync)
 * lives in library/appearance.spec.ts (THEME-D0xx); WCAG checks in appearance-a11y.spec.ts.
 *
 * The logged-in case (THEME-M008) reads the auth_*.json storage state that global-setup writes,
 * as mobile-surfaces-scroll.spec.ts does.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import {
  APPEARANCE,
  APPEARANCE_CONTRAST_SELECTORS,
  installAnalyticsCapture,
  installPaintProbe,
  seedThemeCookie,
} from '../pages/appearancePage';

const ENGLISH_LIBRARY = MODULE_URLS.EN.LIBRARY;
const TEXTS = `${ENGLISH_LIBRARY}${APPEARANCE.PATHS.TEXTS}`;
const READER = `${ENGLISH_LIBRARY}${APPEARANCE.PATHS.READER}`;

// ---------------------------------------------------------------------------
// Structure and behaviour — anonymous, English, light system
// ---------------------------------------------------------------------------

test.describe('Mobile Appearance — hamburger (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await installAnalyticsCapture(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
  });

  test('THEME-M001: not in the top bar; in the drawer right after the language row; Auto by default', async () => {
    await pm.onAppearance().expectNoControlOutsideMobileMenu();

    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().expectMobilePlacement();
    await pm.onAppearance().expectMobilePressed('auto');
    await pm.onAppearance().expectMobileTargetSize();
    await pm.onAppearance().expectTheme('light');
    await pm.onAppearance().expectThemeCookie(null);
  });

  test('THEME-M002: tapping Dark, Light and Auto: data-theme, theme-color, cookie, analytics; the drawer stays open', async () => {
    await pm.onMobileHamburger().openMenu();
    const documentLoads = pm.onAppearance().trackDocumentLoads();

    await pm.onAppearance().selectMobile('dark', 'dark');
    await pm.onAppearance().expectMobileMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('dark');
    await pm.onAppearance().expectThemeColorFor('dark');
    await pm.onAppearance().expectAppearanceEventCount(1);
    await pm.onAppearance().expectLastAppearanceEvent('mobile', { from: 'auto', to: 'dark', theme: 'dark' });

    await pm.onAppearance().selectMobile('light', 'light');
    await pm.onAppearance().expectMobileMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('light');
    await pm.onAppearance().expectThemeColorFor('light');
    await pm.onAppearance().expectAppearanceEventCount(2);
    await pm.onAppearance().expectLastAppearanceEvent('mobile', { from: 'dark', to: 'light', theme: 'light' });

    await pm.onAppearance().selectMobile('auto', 'light');
    await pm.onAppearance().expectMobileMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('auto');
    await pm.onAppearance().expectAppearanceEventCount(3);
    await pm.onAppearance().expectLastAppearanceEvent('mobile', { from: 'light', to: 'auto', theme: 'light' });

    expect(documentLoads(), 'choosing must not reload the page').toBe(0);
  });

  test('THEME-M003: Dark persists across reload and navigation from the drawer', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().selectMobile('dark', 'dark');

    await pm.onAppearance().reload();
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onAppearance().expectServerRendered('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().expectMobilePressed('dark');

    // In-app navigation from a drawer link.
    await pm.onMobileHamburger().clickTopicsAndExpectTopicsPage();
    await pm.onAppearance().expectTheme('dark');

    // Full page load of a reader page (no header on the mobile reader: theme only).
    await pm.onAppearance().goto(READER);
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeCookie('dark');
  });

  test('THEME-M004: drawer contrast spot checks and option chip contrast pass in both themes', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.MOBILE_MENU);
    await pm.onAppearance().expectOptionContrast('mobile');

    await pm.onAppearance().selectMobile('dark', 'dark');
    await pm.onAppearance().expectContrast(APPEARANCE_CONTRAST_SELECTORS.MOBILE_MENU);
    await pm.onAppearance().expectOptionContrast('mobile');
  });

  test('THEME-M005: Auto follows a live system change; an explicit Light ignores it', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().emulateSystemTheme('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectMobilePressed('auto');
    await pm.onAppearance().emulateSystemTheme('light');
    await pm.onAppearance().expectTheme('light');

    await pm.onAppearance().selectMobile('light', 'light');
    await pm.onAppearance().emulateSystemTheme('dark');
    await pm.onAppearance().expectThemeStays('light');
    await pm.onAppearance().expectMobileMenuStillOpen();
  });
});

// ---------------------------------------------------------------------------
// First paint — a dark cookie is set before the first request
// ---------------------------------------------------------------------------

test.describe('Mobile Appearance — first paint with a dark cookie (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, ENGLISH_LIBRARY, 'dark');
    await installPaintProbe(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
  });

  test('THEME-M006: no light flash on mobile; the drawer shows Dark pressed', async () => {
    await pm.onAppearance().expectNoFlash('dark');
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeColorFor('dark');

    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().expectMobilePressed('dark');

    await pm.onAppearance().goto(READER);
    await pm.onAppearance().expectNoFlash('dark');
  });
});

// ---------------------------------------------------------------------------
// First paint — Auto on a dark system: a brand-new context with no cookie
// ---------------------------------------------------------------------------

test.describe('Mobile Appearance — first paint, Auto with a dark system (English)', () => {
  test.use({ colorScheme: 'dark' });

  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await installPaintProbe(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
  });

  test('THEME-M007: the head script picks dark before CSS (no light flash); the drawer shows Auto pressed', async () => {
    await pm.onAppearance().expectSystemTheme('dark');
    await pm.onAppearance().expectNoFlash('dark');
    await pm.onAppearance().expectServerRendered(null);
    await pm.onAppearance().expectTheme('dark');
    await pm.onAppearance().expectThemeColorFor('dark');
    await pm.onAppearance().expectThemeCookie(null);

    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().expectMobilePressed('auto');
  });
});

// ---------------------------------------------------------------------------
// Logged in
// ---------------------------------------------------------------------------

test.describe('Mobile Appearance — Logged In', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, TEXTS, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
  });

  test('THEME-M008: the logged-in drawer has the row right after the language row, and it works', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onMobileHamburger().expectLogoutPresentAndSignupAbsent();
    await pm.onAppearance().expectMobilePlacement();

    await pm.onAppearance().selectMobile('dark', 'dark');
    await pm.onAppearance().expectMobileMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('dark');
  });
});

// ---------------------------------------------------------------------------
// Hebrew interface
// ---------------------------------------------------------------------------

test.describe('Mobile Appearance — Hebrew', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}${APPEARANCE.PATHS.TEXTS}`, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
  });

  test('THEME-M009: the Hebrew drawer shows מראה (אוטומטי / בהיר / כהה) after the language row, RTL, and works', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onAppearance().expectMobilePlacement();
    await pm.onAppearance().expectMobilePressed('auto');

    await pm.onAppearance().selectMobile('dark', 'dark');
    await pm.onAppearance().expectMobileMenuStillOpen();
    await pm.onAppearance().expectThemeCookie('dark');
  });
});
