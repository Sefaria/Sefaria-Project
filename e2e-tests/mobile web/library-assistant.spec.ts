import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t, testLAUser } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * Library Assistant on mobile web — Library module (English).
 *
 * The `<lc-chatbot>` widget renders at every viewport for a logged-in user
 * with the assistant enabled (static/js/ReaderApp.jsx `displayChatbot`). On
 * phones the widget switches to its compact layout: closed on load, opened
 * either from its own launcher or from the "Library Assistant" drawer item
 * (static/js/Header.jsx `MobileNavMenu`), and a full-screen sheet once open.
 *
 * The mobile config has no global-setup auth state, so each test logs in
 * through the drawer with the LA account (PLAYWRIGHT_LA_USER_*), like
 * auth-flow.spec.ts does with `testUser`.
 *
 * Test IDs: LAM-### (Library Assistant, mobile).
 */

const ENGLISH_LIBRARY = MODULE_URLS.EN.LIBRARY;

async function loginAsLAUserViaHamburger(page: Page, pm: PageManager): Promise<void> {
  await pm.onMobileHamburger().openMenu();
  await pm.onMobileHamburger().clickLogInAndExpectLoginPage();
  await pm.onLoginPage().loginAs(testLAUser);
  await expect(page).toHaveURL(/\/texts/, { timeout: t(20000) });
  await hideAllModalsAndPopups(page);
  await pm.onMobileHamburger().waitForHeaderReady();
}

test.describe('Library Assistant — mobile web (English)', () => {
  test.skip(!testLAUser.email || !testLAUser.password, 'PLAYWRIGHT_LA_USER_EMAIL / _PASSWORD not set');

  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, ENGLISH_LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onMobileHamburger().waitForHeaderReady();
    await pm.onMobileHamburger().switchToEnglishIfNeeded();
    await loginAsLAUserViaHamburger(page, pm);
    await pm.onLibraryAssistant().waitForReady();
  });

  test('LAM-001: widget mounts in the compact layout and starts closed', async () => {
    await pm.onLibraryAssistant().expectCompactLayout();
    await pm.onLibraryAssistant().expectTriggerVisible();
  });

  test('LAM-002: the drawer item opens the assistant as a full-screen sheet', { tag: '@sanity' }, async () => {
    await pm.onMobileHamburger().openMenu();
    await pm.onMobileHamburger().expectLibraryAssistantItemVisible();
    await pm.onMobileHamburger().tapLibraryAssistant();
    await pm.onLibraryAssistant().expectSheetCoversViewport();
  });

  test('LAM-003: the sheet stays closed across a reload once dismissed', async () => {
    await pm.onLibraryAssistant().clickTriggerAndExpectOpen();
    await pm.onLibraryAssistant().expectSheetCoversViewport();
    await pm.onLibraryAssistant().ensureClosed();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().expectTriggerVisible();
  });
});
