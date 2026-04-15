import { test, expect, Page } from '@playwright/test';
import { goToPageWithUser, hideAllModalsAndPopups } from '../utils';
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
    await pm.onLibraryAssistant().typeMessage('hello');
    await pm.onLibraryAssistant().expectSendEnabled();
  });

  test('UX-024: Pressing Enter sends the typed message', async () => {
    test.setTimeout(t(90000));
    const prompt = 'Say hi in one short word';
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().expectInputCleared();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-026: Clicking the send button sends the typed message', async () => {
    test.setTimeout(t(90000));
    const prompt = 'Say hello in one short word';
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
    await pm.onLibraryAssistant().typeMessage('Give me a short greeting');
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectInputDisabledDuringSend();
    await pm.onLibraryAssistant().waitForResponse();
  });
});
