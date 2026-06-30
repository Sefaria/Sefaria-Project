import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, goToPageWithUser } from '../utils';
import { LANGUAGES, t, BROWSER_SETTINGS } from '../globals';
import { PageManager } from '../pages/pageManager';
import { MODULE_URLS } from '../constants';

/**
 * Library Assistant (LA) — HEBREW interface tests against the `<lc-chatbot>`
 * custom element. Mirrors the English suite in library-assistant.spec.ts, asserting
 * the same behaviours while the component runs `interface-lang="he"`.
 *
 * Hebrew lives on `www.sefaria.org.il`. A logged-in user is routed server-side to
 * the domain matching their account's Site-Language, so this suite uses a dedicated
 * **Hebrew-preference** LA account (`BROWSER_SETTINGS.heLAUser`, creds
 * `PLAYWRIGHT_LA_USER_HE_*`). `global-setup` logs it in natively on the `.org.il`
 * domain, so `goToPageWithUser` just works — no special per-test setup, and the
 * suite runs fully parallel alongside the English one. See assistant/README.md §12.
 *
 * Send-oriented tests hit the real `chat.sefaria.org` backend (~10–20s); their
 * timeout is lifted with `test.setTimeout(t(90000))`.
 */
test.describe('Library Assistant — Hebrew', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithUser(context, MODULE_URLS.HE.LIBRARY, BROWSER_SETTINGS.heLAUser);
    pm = new PageManager(page, LANGUAGES.HE);
    await pm.onLibraryAssistant().waitForReady();
    await pm.onLibraryAssistant().expectInterfaceLang(); // asserts interface-lang="he"
  });

  test('UX-001 (HE): Floating trigger button is visible when the panel is closed', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureClosed();
    await pm.onLibraryAssistant().expectTriggerVisible();
  });

  test('UX-003 (HE): Clicking the floating trigger opens the chat panel and focuses input', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureClosed();
    await pm.onLibraryAssistant().clickTriggerAndExpectOpen();
  });

  test('UX-004 (HE): Close button closes the chat panel', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().clickCloseAndExpectClosed();
  });

  test('UX-013 (HE): Toggle panel to docked (side-rail) mode', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureFloating();
    await pm.onLibraryAssistant().toggleToDocked();
  });

  test('UX-014 (HE): Toggle panel from docked back to floating mode', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureFloating();
    await pm.onLibraryAssistant().toggleToDocked();
    await pm.onLibraryAssistant().toggleToFloating();
  });

  test('UX-022 (HE): Send button is disabled when the input is empty', { tag: '@sanity' }, async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().clearInput();
    await pm.onLibraryAssistant().expectSendDisabled();
  });

  test('UX-023 (HE): Send button is enabled when the input has text', async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> שלום');
    await pm.onLibraryAssistant().expectSendEnabled();
  });

  test('UX-024 (HE): Pressing Enter sends the typed message', async () => {
    test.setTimeout(t(90000));
    const prompt = '<AUTO TEST> תגיד שלום במילה אחת';
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().expectInputCleared();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-026 (HE): Clicking the send button sends the typed message', async () => {
    test.setTimeout(t(90000));
    const prompt = '<AUTO TEST> תגיד שלום בקצרה';
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaButton();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().expectInputCleared();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-027 (HE): Input and send button are disabled while awaiting a response', async () => {
    test.setTimeout(t(90000));
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> תן לי ברכה קצרה');
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectInputDisabledDuringSend();
    await pm.onLibraryAssistant().waitForResponse();
  });

  test('UX-036 (HE): Thinking indicator appears immediately after sending a message', async () => {
    test.setTimeout(t(90000));
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage('<AUTO TEST> תגיד שלום בקצרה');
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectThinkingVisible();
    await pm.onLibraryAssistant().waitForResponse();
    await pm.onLibraryAssistant().expectThinkingGone();
  });

  // Header More-options menu (UX-057 → UX-060)
  test('UX-057 (HE): More-options menu opens with the expected items', { tag: '@sanity' }, async () => {
    // The "Settings" item only renders for Django-staff accounts. The expected
    // Hebrew texts (4, or 5 with Settings) come from the POM label set, keyed on
    // BROWSER_SETTINGS.heLAUser.isModerator — keep that flag in sync with the account.
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().expectMenuVisible();
    await pm.onLibraryAssistant().expectMenuItemTexts(
      pm.onLibraryAssistant().expectedMenuTexts(BROWSER_SETTINGS.heLAUser.isModerator),
    );
  });

  test('UX-058 (HE): Clicking outside the menu closes it', async () => {
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().clickOutsideMenu();
    await pm.onLibraryAssistant().expectMenuHidden();
  });

  test('UX-059 (HE): Pressing Escape closes the menu', async () => {
    // Same component limitation as the English UX-059 — no Escape-to-close handler.
    test.fixme(true, 'Component does not yet handle Escape to close the header menu (matches English UX-059)');
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().closeMenuWithEscape();
    await pm.onLibraryAssistant().expectMenuHidden();
  });

  test('UX-060 (HE): Restart conversation clears all messages and shows empty state', async () => {
    test.setTimeout(t(90000));
    const prompt = '<AUTO TEST> שלום עבור בדיקת איפוס';
    await pm.onLibraryAssistant().ensureOpen();
    await pm.onLibraryAssistant().typeMessage(prompt);
    await pm.onLibraryAssistant().sendViaEnter();
    await pm.onLibraryAssistant().expectUserMessageShown(prompt);
    await pm.onLibraryAssistant().waitForResponse();
    await pm.onLibraryAssistant().openHeaderMenu();
    await pm.onLibraryAssistant().clickRestartConversation();
    await pm.onLibraryAssistant().expectEmptyState();
    await pm.onLibraryAssistant().expectNoUserMessages();
    await pm.onLibraryAssistant().expectTextareaEnabled();
  });

  // Responsive — UX-085
  test('UX-085 (HE): Library Assistant is hidden on a 375 px mobile viewport', { tag: '@sanity' }, async () => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('lc-chatbot')).toBeHidden({ timeout: t(5000) });
  });
});

/**
 * Negative-coverage (Hebrew): the LA must NOT appear outside its intended surface.
 * These do not require a logged-in Hebrew session (they assert absence), so they
 * run independently of the flip hooks above.
 */
test.describe('Library Assistant — Hebrew visibility boundaries', () => {
  test('LA-NEG-HE-001: Does not appear on the Hebrew Voices home', { tag: '@sanity' }, async ({ context }) => {
    const page = await goToPageWithUser(context, MODULE_URLS.HE.VOICES, BROWSER_SETTINGS.heLAUser);
    const pm = new PageManager(page, LANGUAGES.HE);
    await pm.onLibraryAssistant().expectNotPresent();
  });

  test('LA-NEG-HE-003: Does not appear for a logged-out user on the Hebrew library home', { tag: '@sanity' }, async ({ context }) => {
    const page = await goToPageWithLang(context, MODULE_URLS.HE.LIBRARY, LANGUAGES.HE);
    const pm = new PageManager(page, LANGUAGES.HE);
    await pm.onLibraryAssistant().expectNotPresent();
  });

  test('LA-NEG-HE-004: Does not appear for a logged-out user on a Hebrew reader page', async ({ context }) => {
    const page = await goToPageWithLang(context, `${MODULE_URLS.HE.LIBRARY}/Genesis.1`, LANGUAGES.HE);
    const pm = new PageManager(page, LANGUAGES.HE);
    await pm.onLibraryAssistant().expectNotPresent();
  });
});
