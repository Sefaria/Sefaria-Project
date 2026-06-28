import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * Mobile hamburger menu — Library module (English).
 *
 * Renders against the mobile viewport configured in `playwright.mobileweb.config.ts`
 * (Pixel 5: 393 × 851). Mobile chrome is gated on viewport width < 843 px
 * — see `static/css/breakpoints.css` --bp-tablet-min.
 *
 * Test taxonomy:
 *   - Header / menu structure (HAM-S###)   — visibility and contents of the
 *     hamburger drawer.
 *   - Search dropdown (HAM-Q###)          — typed-search results in the drawer.
 *   - In-module navigation (HAM-N###)     — links that stay on the Library
 *     module: Texts, Topics, About, More from Sefaria.
 *   - External-tab navigation (HAM-X###)  — target="_blank" links: Donate,
 *     Get Help, Developers on Sefaria.
 *   - Cross-module navigation (HAM-M###)  — module switch to Voices and
 *     subsequent menu re-render.
 *
 * Each test re-opens a fresh anonymous English Library page in `beforeEach`
 * so cases stay independent; the cross-module test is the only multi-step
 * flow and lives in its own describe block.
 */

const ENGLISH_LIBRARY = MODULE_URLS.EN.LIBRARY;
const VOICES_URL = MODULE_URLS.EN.VOICES;
const VOICES_URL_PATTERN = new RegExp(VOICES_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

// ---------------------------------------------------------------------------
// Structure — header chrome and full drawer contents
// ---------------------------------------------------------------------------

test.describe('Mobile Hamburger — Library structure (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    // Step 1 + 2 of the user spec: click hamburger, ensure English is active.
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
    await pm.onMobileHamburger().openMenu();
  });

  test('HAM-S001: Mobile header shows the hamburger, Library logo, and A/א toggle', async () => {
    // Close the drawer so the header is the only surface being asserted on.
    await pm.onMobileHamburger().closeMenu();
    await pm.onMobileHamburger().expectMobileHeaderArtifactsVisible();
  });

  test('HAM-S002: Open hamburger drawer renders all expected English menu items', async () => {
    await pm.onMobileHamburger().expectLibraryMenuArtifactsVisible();
  });
});

// ---------------------------------------------------------------------------
// Search dropdown — typed search must surface only Library categories
// ---------------------------------------------------------------------------

test.describe('Mobile Hamburger — search dropdown (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
    await pm.onMobileHamburger().openMenu();
  });

  test('HAM-Q001: Typing "mid" in mobile search shows only authors / topics / categories / books', async () => {
    await pm.onMobileHamburger().expectLibrarySearchGroupsOnly();
  });

  test('HAM-Q002: Exiting the search bar returns the user to the open hamburger drawer', async () => {
    await pm.onMobileHamburger().expectLibrarySearchGroupsOnly();
    await pm.onMobileHamburger().exitSearch();
    // After exit the drawer is still open and the canonical items are still
    // present — assert one representative item to keep the test focused.
    await pm.onMobileHamburger().expectLibraryMenuArtifactsVisible();
  });
});

// ---------------------------------------------------------------------------
// In-module navigation — Library pages reached from the hamburger
// ---------------------------------------------------------------------------

test.describe('Mobile Hamburger — in-module navigation (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
    await pm.onMobileHamburger().openMenu();
  });

  test('HAM-N001: Tapping Texts navigates to /texts', async () => {
    await pm.onMobileHamburger().clickTextsAndExpectTextsPage();
  });

  test('HAM-N002: Tapping Topics navigates to /topics', async () => {
    await pm.onMobileHamburger().clickTopicsAndExpectTopicsPage();
  });

  test('HAM-N003: Tapping About Sefaria navigates to /mobile-about-menu', async () => {
    await pm.onMobileHamburger().clickAboutAndExpectAboutPage();
  });

  test('HAM-N004: Tapping More from Sefaria navigates to /products', async () => {
    await pm.onMobileHamburger().clickMoreFromSefariaAndExpectProductsPage();
  });
});

// ---------------------------------------------------------------------------
// External-tab navigation — target="_blank" links open a popup we then close
// ---------------------------------------------------------------------------

test.describe('Mobile Hamburger — external-tab links (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
    await pm.onMobileHamburger().openMenu();
  });

  test('HAM-X001: Donate opens donate.sefaria.org in a new tab', async () => {
    await pm.onMobileHamburger().clickDonateAndCloseExternalTab();
    // Closing the popup leaves us on the original tab; the drawer is still open.
    expect(page.url()).toContain('sefaria');
  });

  test('HAM-X002: Get Help opens the help center in a new tab', async () => {
    await pm.onMobileHamburger().clickGetHelpAndCloseExternalTab();
    expect(page.url()).toContain('sefaria');
  });
});

// ---------------------------------------------------------------------------
// Cross-module navigation — Voices switch + return route
// ---------------------------------------------------------------------------
//
// The user's flow requires three observable states in succession:
//   1. From Library hamburger → tap "Voices on Sefaria" → land on voices.*.
//   2. Re-open hamburger on voices → "Voices on Sefaria" is replaced by
//      "Sefaria Library".
//   3. From the voices hamburger → tap "Developers on Sefaria" → external tab
//      opens to developers.sefaria.org; closing it returns to the voices
//      hamburger page (we re-open the drawer afterwards to mirror the user's
//      stated end-state).
//
// The first two states are encoded as one test because the second only exists
// as a consequence of the first; the developers-tab assertion lives in its own
// test so a failure there does not mask the module-switch verification.

test.describe('Mobile Hamburger — cross-module navigation (English)', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
    await pm.onMobileHamburger().openMenu();
  });

  test('HAM-M001: Voices on Sefaria opens voices.* in a new tab; its hamburger shows Sefaria Library', async () => {
    test.setTimeout(t(90000));

    const voicesPage = await pm
      .onMobileHamburger()
      .clickVoicesOnSefariaAndExpectVoicesModule(VOICES_URL_PATTERN);

    // The cross-module link opens a popup (ReaderApp.openURL → window.open).
    // Drive the voices page through its own PageManager so locators are scoped
    // to the new tab, not the original library tab.
    const voicesPm = new PageManager(voicesPage, LANGUAGES.EN);
    await hideAllModalsAndPopups(voicesPage);
    await voicesPm.onMobileHamburger().waitForHeaderReady();
    await voicesPm.onMobileHamburger().openMenu();
    await voicesPm.onMobileHamburger().expectSefariaLibraryLinkPresent();

    await voicesPage.close();
  });

  test('HAM-M002: Developers on Sefaria opens developers.sefaria.org in a new tab from the voices hamburger', async () => {
    test.setTimeout(t(90000));

    const voicesPage = await pm
      .onMobileHamburger()
      .clickVoicesOnSefariaAndExpectVoicesModule(VOICES_URL_PATTERN);

    const voicesPm = new PageManager(voicesPage, LANGUAGES.EN);
    await hideAllModalsAndPopups(voicesPage);
    await voicesPm.onMobileHamburger().waitForHeaderReady();
    await voicesPm.onMobileHamburger().openMenu();

    await voicesPm.onMobileHamburger().clickDevelopersAndCloseExternalTab();
    // Sanity: the voices tab itself stays on voices.* after the popup closes.
    expect(voicesPage.url()).toMatch(VOICES_URL_PATTERN);

    await voicesPage.close();
  });
});
