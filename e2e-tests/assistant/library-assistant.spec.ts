import { test, expect, Page, BrowserContext } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser, hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import { blockAssistantScript } from '../pages/libraryAssistantPage';
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
    await pm.onLibraryAssistant().waitForReady();
  });

  test('UX-001: Floating trigger button is visible when the panel is closed', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureClosed();
    await pm.onLibraryAssistant().expectTriggerVisible();
  });

  test('UX-003: Clicking the floating trigger opens the chat panel and focuses input', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureClosed();
    await pm.onLibraryAssistant().clickTriggerAndExpectOpen();
  });

  test('UX-004: Close button closes the chat panel', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().clickCloseAndExpectClosed();
  });

  test('UX-013: Toggle panel to docked (side-rail) mode', { tag: '@sanity' }, async () => {
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

  test('UX-023: Send button is enabled when the input has text', { tag: '@sanity' }, async () => {
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

  test('UX-026: Clicking the send button sends the typed message', { tag: '@sanity' }, async () => {
    test.setTimeout(t(90000));
    const prompt = '<AUTO TEST> Say hello in one short word';
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaButton();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().expectInputCleared();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-027: Input is disabled and Send is replaced by Stop while awaiting a response', { tag: '@sanity' }, async () => {
    test.setTimeout(t(90000));
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> Give me a short greeting');
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectInputDisabledAndStopShownDuringSend();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-036: Thinking indicator appears immediately after sending a message', { tag: '@sanity' }, async () => {
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
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().ensureOpen();
  });

  test('UX-057: More-options menu opens with the expected items', async () => {
    // The QA LA user is marked staff in Django (so Braintree can filter
    // automation noise via its "is staff?" column). Staff users see an extra
    // "Settings" item inserted at the top of the menu (`isModerator` branch
    // in LCChatbot.svelte). The menu's dock item names the opposite mode, so
    // start floating to know which one it shows.
    await pm.onLibraryAssistant().ensureFloating();
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().expectMenuVisible();
    await pm.onLibraryAssistant().expectMenuItemTexts(
      pm.onLibraryAssistant().expectedMenuTexts(BROWSER_SETTINGS.enLAUser.isModerator),
    );
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

  test('UX-060: Restart conversation clears all messages and shows empty state', { tag: '@sanity' }, async () => {
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
    await pm.onLibraryAssistant().expectTextareaEnabled();
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
    await pm.onLibraryAssistant().expectNotPresent();
  });

  test('LA-NEG-002: Does not appear on a voices sheet page', async ({ context }) => {
    const page = await goToPageWithUser(context, `${MODULE_URLS.EN.VOICES}/sheets/393695`, BROWSER_SETTINGS.enLAUser);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onLibraryAssistant().expectNotPresent();
  });

  test('LA-LOGGED-OUT-001: Appears for a logged-out user on the library home', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onLibraryAssistant().waitForReady();
  });

  test('LA-LOGGED-OUT-002: Appears for a logged-out user on a reader page', async ({ context }) => {
    const page = await goToPageWithLang(context, `${MODULE_URLS.EN.LIBRARY}/Genesis.1`, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onLibraryAssistant().waitForReady();
  });

  // The whole chain for a logged-out visitor: Sefaria renders the widget without a
  // user, the widget sends its anonymous ID, and the real chat server answers.
  test('LA-LOGGED-OUT-003: A logged-out user can ask a question and get an answer', async ({ context }) => {
    test.setTimeout(t(90000));
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    const prompt = '<AUTO TEST> Say hi in one short word';
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().expectAnswerShown();
  });

  // Once the free answers are used up, the widget's login prompt shows Sefaria's sign-up
  // options (Google, Apple, Email), which Sefaria puts in the widget's signup-options slot.
  // Getting there for real takes real answers, so the widget's "used up" flag is seeded.
  async function openWithFreeAnswersUsedUp(context: BrowserContext) {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().seedFreeAnswersUsedUp();
    await page.reload();
    await hideAllModalsAndPopups(page);
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().ensureOpen();
    return { page, pm };
  }

  test('LA-LOGGED-OUT-005: The sign-up options appear in the assistant once the free answers are used up', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().expectSignupOptionsHidden();

    const usedUp = await openWithFreeAnswersUsedUp(context);

    await usedUp.pm.onLibraryAssistant().expectSignupOptionsShown();
  });

  test('LA-LOGGED-OUT-006: Email opens the sign-up form in-page, reported as an email sign-up from the assistant', async ({ context }) => {
    const { pm } = await openWithFreeAnswersUsedUp(context);
    await pm.onLibraryAssistant().recordAnalyticsEvents();

    await pm.onLibraryAssistant().signupOption('email').click();

    await pm.onLoginPage().expectEmailSignupFormShown();
    // The assistant isn't shown on the login and registration screens.
    await pm.onLibraryAssistant().expectNotPresent();
    const events = await pm.onLibraryAssistant().analyticsEvents();
    const auth = events.filter((e) => e.name.startsWith('auth_'));
    expect(auth.map((e) => e.name)).toEqual(['auth_flow_started', 'auth_method_chosen', 'auth_process_started']);
    expect(auth[0]).toMatchObject({ source: 'rate_limit_login_button', flow_intent: 'registration' });
    expect(auth[1]).toMatchObject({ method: 'email' });
    // The assistant reports the click too.
    expect(events).toContainEqual(expect.objectContaining({ name: 'assistant_click', feature_name: 'rate_limit_login_button' }));
  });

  test('LA-LOGGED-OUT-007: Apple starts Apple sign-up, reported as a sign-up from the assistant', async ({ context }) => {
    const { pm } = await openWithFreeAnswersUsedUp(context);
    test.skip(!(await pm.onLibraryAssistant().configuredProviders()).includes('apple'),
      'Apple sign-in is not configured on this sandbox');
    await pm.onLibraryAssistant().stubAppleSignIn();
    await pm.onLibraryAssistant().recordAnalyticsEvents();

    await pm.onLibraryAssistant().signupOption('apple').click();

    const events = await pm.onLibraryAssistant().analyticsEvents();
    const auth = events.filter((e) => e.name.startsWith('auth_'));
    expect(auth.map((e) => e.name)).toEqual(['auth_flow_started', 'auth_method_chosen', 'auth_process_started']);
    expect(auth[0]).toMatchObject({ source: 'rate_limit_login_button', flow_intent: 'registration' });
    expect(auth[1]).toMatchObject({ method: 'apple' });
    // The assistant reports the click too.
    expect(events).toContainEqual(expect.objectContaining({ name: 'assistant_click', feature_name: 'rate_limit_login_button' }));
  });

  // A click on Google's own button can't be automated; this checks it's in place.
  test('LA-LOGGED-OUT-008: Google\'s own sign-in button covers the Google option', async ({ context }) => {
    const { pm } = await openWithFreeAnswersUsedUp(context);
    test.skip(!(await pm.onLibraryAssistant().configuredProviders()).includes('google'),
      'Google sign-in is not configured on this sandbox');

    await pm.onLibraryAssistant().expectGoogleButtonOverGoogleOption();
  });

  test('LA-LOGGED-OUT-009: A logged-in user\'s assistant has no sign-up options', async ({ context }) => {
    const page = await goToPageWithUser(context, MODULE_URLS.EN.LIBRARY, BROWSER_SETTINGS.enLAUser);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onLibraryAssistant().waitForReady();

    await pm.onLibraryAssistant().expectNoSignupOptions();
  });

  // Until the assistant's script defines <lc-chatbot>, its children are plain page content.
  // If the script never loads (the chat server is down), the sign-up options Sefaria puts
  // in it must not show up in the page and push the reader's layout around.
  test('LA-LOGGED-OUT-010: If the assistant doesn\'t load, its sign-up options stay out of the page', async ({ context }) => {
    await blockAssistantScript(context);
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);

    await pm.onLibraryAssistant().expectSignupOptionsRenderedButNotShown();
  });

  // Logout (from any module) sets the lc_chatbot_clear cookie; the next Library page
  // clears the assistant's saved chat so the next visitor on this browser doesn't see it.
  // The logout itself isn't performed: it would destroy a shared auth session (rule §2.21).
  test('LA-LOGGED-OUT-004: After a logout the next Library page clears the saved chat', async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    const pm = new PageManager(page, LANGUAGES.EN);
    await pm.onLibraryAssistant().seedSavedChat();
    expect(await pm.onLibraryAssistant().savedChatKeys()).not.toEqual([]);
    // Set the way logout sets it: on the shared cookie domain (www.x.org → .x.org) on a
    // deployed sandbox, host-only on a local one (localhost / an IP has no shared domain).
    const libraryHost = new URL(MODULE_URLS.EN.LIBRARY).hostname;
    const isLocalHost = !libraryHost.includes('.') || /^\d+(\.\d+){3}$/.test(libraryHost);
    const clearCookie = isLocalHost
      ? { name: 'lc_chatbot_clear', value: '1', url: MODULE_URLS.EN.LIBRARY }
      : { name: 'lc_chatbot_clear', value: '1', domain: '.' + libraryHost.split('.').slice(1).join('.'), path: '/' };
    await context.addCookies([clearCookie]);

    await page.reload();

    expect(await pm.onLibraryAssistant().savedChatKeys()).toEqual([]);
    const cookies = await context.cookies(MODULE_URLS.EN.LIBRARY);
    expect(cookies.find((c) => c.name === 'lc_chatbot_clear')).toBeUndefined();
  });
});

