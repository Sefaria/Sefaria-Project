import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { BROWSER_SETTINGS, LANGUAGES } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';
import {
  THEME,
  THEME_CONTRAST_SELECTORS,
  installAnalyticsCapture,
  installPaintProbe,
  seedThemeCookie,
} from '../pages/themeTogglePage';

/**
 * Dark-mode theme toggle — mobile hamburger menu (Library module).
 *
 * Renders against the mobile viewport configured in `playwright.mobileweb.config.ts`
 * (Pixel 5 393 x 851, iPhone 13). On mobile the toggle is NOT in the top bar: it is a
 * `role="switch"` row (`.mobileThemeToggle`) in the drawer's `.mobileAccountLinks`,
 * directly after the interface-language row, and tapping it leaves the drawer open.
 * Selectors and the full contract live in pages/themeTogglePage.ts.
 *
 * Test IDs: THEME-M0xx. Desktop coverage (server rendering, JS disabled, Voices
 * hand-off, keyboard) lives in library/theme-toggle.spec.ts (THEME-D0xx).
 *
 * The logged-in case (THEME-M006) reads the auth_*.json storage state that the
 * desktop config's global-setup writes, as mobile-surfaces-scroll.spec.ts does.
 */

const ENGLISH_LIBRARY = MODULE_URLS.EN.LIBRARY;
const TEXTS = `${ENGLISH_LIBRARY}${THEME.PATHS.TEXTS}`;
const READER = `${ENGLISH_LIBRARY}${THEME.PATHS.READER}`;

// ---------------------------------------------------------------------------
// Structure and behavior — anonymous, English
// ---------------------------------------------------------------------------

test.describe('Mobile Theme Toggle — hamburger (English)', () => {
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

  test('THEME-M001: not in the top bar; in the drawer right after the language row, light by default', async () => {
    await pm.onThemeToggle().expectNoToggleOutsideMobileMenu();

    await pm.onMobileHamburger().openMenu();
    await pm.onThemeToggle().expectMobileTogglePlacement();
    await pm.onThemeToggle().expectMobileChecked(false);
    await pm.onThemeToggle().expectMobileTouchTarget();
    await pm.onThemeToggle().expectTheme('light');
    await pm.onThemeToggle().expectThemeCookie(null);
  });

  test('THEME-M002: tapping switches to dark and back, and the drawer stays open', async () => {
    const lightThemeColor = await pm.onThemeToggle().getThemeColor();
    await pm.onMobileHamburger().openMenu();
    const documentLoads = pm.onThemeToggle().trackDocumentLoads();

    await pm.onThemeToggle().toggleMobileTo('dark');
    await pm.onThemeToggle().expectMobileMenuStillOpen();
    await pm.onThemeToggle().expectThemeCookie('dark');
    await pm.onThemeToggle().expectThemeColor(THEME.DARK_THEME_COLOR);
    await pm.onThemeToggle().expectThemeToggleEventCount(1);

    await pm.onThemeToggle().toggleMobileTo('light');
    await pm.onThemeToggle().expectMobileMenuStillOpen();
    await pm.onThemeToggle().expectThemeCookie('light');
    await pm.onThemeToggle().expectThemeColor(lightThemeColor!);
    await pm.onThemeToggle().expectThemeToggleEventCount(2);

    expect(documentLoads(), 'toggling must not reload the page').toBe(0);
  });

  test('THEME-M003: dark persists across reload and navigation from the drawer', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onThemeToggle().toggleMobileTo('dark');

    await pm.onThemeToggle().reload();
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onMobileHamburger().openMenu();
    await pm.onThemeToggle().expectMobileChecked(true);

    // In-app navigation from a drawer link.
    await pm.onMobileHamburger().clickTopicsAndExpectTopicsPage();
    await pm.onThemeToggle().expectTheme('dark');

    // Full page load of a reader page (no header on the mobile reader: theme only).
    await pm.onThemeToggle().goto(READER);
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectThemeCookie('dark');
  });

  test('THEME-M004: drawer contrast spot checks pass in both themes', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onThemeToggle().expectContrast(THEME_CONTRAST_SELECTORS.MOBILE_MENU);

    await pm.onThemeToggle().toggleMobileTo('dark');
    await pm.onThemeToggle().expectContrast(THEME_CONTRAST_SELECTORS.MOBILE_MENU);
  });

  test('THEME-M005: an OS dark preference without a theme cookie still renders light', async () => {
    await pm.onThemeToggle().emulateOsDarkPreference();
    await pm.onThemeToggle().reload();
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onThemeToggle().expectPrefersDarkEmulated();
    await pm.onThemeToggle().expectTheme('light');
    await pm.onMobileHamburger().openMenu();
    await pm.onThemeToggle().expectMobileChecked(false);
    await pm.onThemeToggle().expectThemeCookie(null);
  });
});

// ---------------------------------------------------------------------------
// First paint — the dark cookie is set before the first request
// ---------------------------------------------------------------------------

test.describe('Mobile Theme Toggle — first paint with a dark cookie (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    await seedThemeCookie(context, ENGLISH_LIBRARY, THEME.DARK);
    await installPaintProbe(context);
    page = await goToPageWithLang(context, TEXTS, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
  });

  test('THEME-M006: no light flash on mobile; the drawer switch reflects the cookie', async () => {
    await pm.onThemeToggle().expectNoFlash('dark');
    await pm.onThemeToggle().expectTheme('dark');
    await pm.onThemeToggle().expectThemeColor(THEME.DARK_THEME_COLOR);

    await pm.onMobileHamburger().openMenu();
    await pm.onThemeToggle().expectMobileChecked(true);

    await pm.onThemeToggle().goto(READER);
    await pm.onThemeToggle().expectNoFlash('dark');
  });
});

// ---------------------------------------------------------------------------
// Logged in
// ---------------------------------------------------------------------------

test.describe('Mobile Theme Toggle — Logged In', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, TEXTS, BROWSER_SETTINGS.enUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
  });

  test('THEME-M007: logged-in drawer has the toggle right after the language row, and it works', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onMobileHamburger().expectLogoutPresentAndSignupAbsent();
    await pm.onThemeToggle().expectMobileTogglePlacement();

    await pm.onThemeToggle().toggleMobileTo('dark');
    await pm.onThemeToggle().expectMobileMenuStillOpen();
    await pm.onThemeToggle().expectThemeCookie('dark');
  });
});

// ---------------------------------------------------------------------------
// Hebrew interface (.org.il)
// ---------------------------------------------------------------------------

test.describe('Mobile Theme Toggle — Hebrew', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}${THEME.PATHS.TEXTS}`, LANGUAGES.HE);
    pm = new PageManager(page, LANGUAGES.HE);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
  });

  test('THEME-M008: Hebrew drawer shows "מצב כהה" after the language row and toggles', async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onThemeToggle().expectMobileTogglePlacement();
    await pm.onThemeToggle().expectMobileChecked(false);

    await pm.onThemeToggle().toggleMobileTo('dark');
    await pm.onThemeToggle().expectMobileMenuStillOpen();
    await pm.onThemeToggle().expectThemeCookie('dark');
  });
});
