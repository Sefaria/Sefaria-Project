import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * Library Assistant (LA) — end-to-end tests against the `<lc-chatbot>`
 * custom element on production `www.sefaria.org`.
 *
 * These tests log in as the whitelisted QA user `<PLAYWRIGHT_LA_USER_EMAIL>`
 * (see `BROWSER_SETTINGS.enLAUser`). For that user the host has
 * `default-open="true"`, so on a fresh context the panel auto-opens; tests
 * that need the closed state explicitly close it first.
 *
 * Send-oriented tests (UX-024, UX-026, UX-027) exercise the real backend at
 * `chat.sefaria.org`. Round-trip is ~10–20s in practice; the test timeout is
 * lifted accordingly.
 */
test.describe('Library Assistant — English', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().waitForReady();
  });

  test('UX-001: Floating trigger button is visible when the panel is closed', async () => {
    await pm.onLibraryAssistant().ensureClosed();
    await pm.onLibraryAssistant().expectTriggerVisible();
  });

  test('UX-003: Clicking the floating trigger opens the chat panel and focuses input', async () => {
    await pm.onLibraryAssistant().ensureClosed();
    await pm.onLibraryAssistant().clickTriggerAndExpectOpen();
  });

  test('UX-004: Close button closes the chat panel', async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().clickCloseAndExpectClosed();
  });

  test('UX-013: Toggle panel to docked (side-rail) mode', async () => {
    await pm.onLibraryAssistant().ensureFloating();
    await pm.onLibraryAssistant().toggleToDocked();
  });

  test('UX-014: Toggle panel from docked back to floating mode', async () => {
    await pm.onLibraryAssistant().ensureFloating();
    await pm.onLibraryAssistant().toggleToDocked();
    await pm.onLibraryAssistant().toggleToFloating();
  });

  test('UX-022: Send button is disabled when the input is empty', async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().clearInput();
    await pm.onLibraryAssistant().expectSendDisabled();
  });

  test('UX-023: Send button is enabled when the input has text', async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> hello');
    await pm.onLibraryAssistant().expectSendEnabled();
  });

  test('UX-024: Pressing Enter sends the typed message', async () => {
    test.setTimeout(t(90000));
    const prompt = '<AUTO TEST> Say hi in one short word';
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().expectInputCleared();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-026: Clicking the send button sends the typed message', async () => {
    test.setTimeout(t(90000));
    const prompt = '<AUTO TEST> Say hello in one short word';
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaButton();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().expectInputCleared();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-027: Input and send button are disabled while awaiting a response', async () => {
    test.setTimeout(t(90000));
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> Give me a short greeting');
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectInputDisabledDuringSend();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-036: Thinking indicator appears immediately after sending a message', async () => {
    test.setTimeout(t(90000));
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> Say hello briefly');
    await pm.onLibraryAssistant().sendViaEnter();
    // The thinking bubble should appear almost immediately
    await pm.onLibraryAssistant().expectThinkingVisible();
    // Wait for the full response — thinking bubble should disappear
    await pm.onLibraryAssistant().waitForResponse();
    await pm.onLibraryAssistant().expectThinkingGone();
  });
});

/**
 * Header More-options menu (UX-057, UX-058, UX-059, UX-060).
 * Each test opens the panel, ensures it is floating, then exercises the menu.
 */
test.describe('Library Assistant — header menu', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().ensureOpen();
  });

  test('UX-057: More-options menu opens with the five expected items', async () => {
    // The QA LA user is marked staff in Django (so Braintree can filter
    // automation noise via its "is staff?" column). Staff users see an extra
    // "Settings" item inserted at the top of the menu (`isModerator` branch
    // in LCChatbot.svelte).
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().expectMenuVisible();
    await pm.onLibraryAssistant().expectMenuItemTexts([
      'Settings',
      'Restart conversation',
      'Give feedback',
      'Help',
      'Opt-out in Settings',
    ]);
  });

  test('UX-058: Clicking outside the menu closes it', async () => {
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().clickOutsideMenu();
    await pm.onLibraryAssistant().expectMenuHidden();
  });

  test('UX-059: Pressing Escape closes the menu', async () => {
    // FIXME: The <lc-chatbot> component does not currently attach a keydown
    // handler for Escape on the menu dropdown or its items, so the menu stays
    // open after Escape is pressed. This test is marked fixme until the
    // component implements Escape-to-close per the UX-059 spec.
    test.fixme(true, 'Component does not yet handle Escape to close the header menu (Might not be a product feature)');
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().closeMenuWithEscape();
    await pm.onLibraryAssistant().expectMenuHidden();
  });

  test('UX-060: Restart conversation clears all messages and shows empty state', async () => {
    test.setTimeout(t(90000));
    // Send a message so there is something to clear
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> Hello for restart test');
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectUserMessageShown('<AUTO TEST> Hello for restart test');
    await pm.onLibraryAssistant().waitForResponse();
    // Restart conversation
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().clickRestartConversation();
    // Empty state should appear; no user messages should remain
    await pm.onLibraryAssistant().expectEmptyState();
    await pm.onLibraryAssistant().expectNoUserMessages();
    // Textarea should be focused and re-enabled
    const textarea = page.getByLabel('Prompt input');
    await expect(textarea).toBeEnabled({ timeout: t(5000) });
  });
});

/**
 * Responsive viewport — UX-085.
 * The Library Assistant must not render at mobile widths (375 px).
 * This test uses the LA user so we can confirm the suppression happens even
 * for a whitelisted user, not just for logged-out / non-whitelisted users.
 */
test.describe('Library Assistant — responsive', () => {
  test('UX-085: Library Assistant is hidden on a 375 px mobile viewport', async ({ context }) => {
    // Navigate and wait for the component to mount at desktop size first
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().waitForReady();

    // Resize to a typical mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // The entire <lc-chatbot> host (and its trigger / panel) should be hidden
    await expect(page.locator('lc-chatbot')).toBeHidden({ timeout: t(5000) });
  });
});

/**
 * Negative-coverage: the LA must NOT appear outside its intended surface.
 * These tests use separate entry helpers (voices URL, logged-out context) so
 * they don't share `beforeEach` with the main suite.
 */

// TO-DO: write so other pages like settings should not have the LA either when logged in. 
test.describe('Library Assistant — visibility boundaries', () => {
  test('LA-NEG-001: Does not appear on voices.sefaria.org home (even when logged in as LA user)', async ({ context }) => {
    const page = await goToPageWithUser(context, MODULE_URLS.EN.VOICES, BROWSER_SETTINGS.enLAUser);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().expectNotPresent();
  });

  test('LA-NEG-002: Does not appear on a voices sheet page', async ({ context }) => {
    const page = await goToPageWithUser(context, `${MODULE_URLS.EN.VOICES}/sheets/393695`, BROWSER_SETTINGS.enLAUser);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().expectNotPresent();
  });

  test('LA-NEG-003: Does not appear for a logged-out user on the library home', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().expectNotPresent();
  });

  test('LA-NEG-004: Does not appear for a logged-out user on a reader page', async ({ context }) => {
    const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().expectNotPresent();
  });
});

