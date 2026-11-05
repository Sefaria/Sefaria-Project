import { BrowserContext, expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';
import { assistantKeys, assistantString, escapeRegExp } from '../support/assistantStrings';

/**
 * Page object for the Sefaria Library Assistant (`<lc-chatbot>` web component).
 *
 * The LA mounts an open shadow root for whitelisted users. Playwright's default
 * engine pierces open shadow DOM for role/label/CSS locators, so everything here
 * uses `page.*` directly — no special pierce syntax.
 *
 * **Bilingual.** The component runs a svelte-i18n build (`interface-lang` = `en` /
 * `he`) and renders every label from a catalog. Labels are read from that catalog
 * by translation key (support/assistantStrings.ts, which needs AI_CHATBOT_REPO_PATH),
 * never typed out here, so a copy edit in Weblate doesn't break the suite.
 */

type LALabelSet = {
  openAssistant: string;
  chatWindow: string;
  close: string;
  dock: string;
  undock: string;
  moreOptions: string;
  promptInput: string;
  send: string;
  /** The Stop button that replaces Send while an answer is being written. */
  stop: string;
  /** aria-label of the "Restart conversation" menu item. */
  restartMenuItemAria: string;
  /** The moderator-only first menu item ("Settings"), shown only when `is-moderator`. */
  settingsMenuText: string;
  /**
   * Visible menu-item texts in order that EVERY user sees (excludes "Settings"),
   * with the panel floating — the dock item reads "undock" when the panel is docked.
   */
  menuTextsBase: string[];
  /** Every message the "thinking" indicator can show: the first one, the rotation, the last one. */
  thinkingMessages: string[];
};

/** The widget's translation key for each label (keys are in ai-chatbot's src/i18n/locales). */
const LA_LABEL_KEYS = {
  openAssistant: 'assistant.header.openAssistant',
  chatWindow: 'assistant.header.chatWindow',
  close: 'assistant.header.close.tooltip',
  dock: 'assistant.header.dock.tooltip',
  undock: 'assistant.header.undock.tooltip',
  moreOptions: 'assistant.header.moreOptions',
  promptInput: 'assistant.input.aria',
  send: 'assistant.input.send.tooltip',
  stop: 'assistant.stop.aria',
  restartMenuItemAria: 'assistant.menu.restart.aria',
  settingsMenuText: 'assistant.menu.settings',
  menuTextsBase: [
    'assistant.history.header.new.tooltip',
    'assistant.menu.dock',
    'assistant.menu.feedback',
    'assistant.menu.help',
    'assistant.menu.optout',
  ],
  thinkingFirst: 'assistant.loading.initial',
  // The widget rotates through every numbered key, so new ones added in Weblate count too.
  thinkingRotation: /^assistant\.thinking\.array\.\d+$/,
  thinkingLast: 'assistant.thinking.final',
} as const;

// Built on first use, not at import: every spec imports this file through the
// PageManager, and only the LA specs need the ai-chatbot checkout.
const labelCache = new Map<string, LALabelSet>();

function labelsFor(language: string): LALabelSet {
  const cached = labelCache.get(language);
  if (cached) return cached;
  const s = (key: string) => assistantString(key, language);
  const labels: LALabelSet = {
    openAssistant: s(LA_LABEL_KEYS.openAssistant),
    chatWindow: s(LA_LABEL_KEYS.chatWindow),
    close: s(LA_LABEL_KEYS.close),
    dock: s(LA_LABEL_KEYS.dock),
    undock: s(LA_LABEL_KEYS.undock),
    moreOptions: s(LA_LABEL_KEYS.moreOptions),
    promptInput: s(LA_LABEL_KEYS.promptInput),
    send: s(LA_LABEL_KEYS.send),
    stop: s(LA_LABEL_KEYS.stop),
    restartMenuItemAria: s(LA_LABEL_KEYS.restartMenuItemAria),
    settingsMenuText: s(LA_LABEL_KEYS.settingsMenuText),
    menuTextsBase: LA_LABEL_KEYS.menuTextsBase.map(s),
    thinkingMessages: [
      LA_LABEL_KEYS.thinkingFirst,
      ...assistantKeys(LA_LABEL_KEYS.thinkingRotation),
      LA_LABEL_KEYS.thinkingLast,
    ].map(s),
  };
  labelCache.set(language, labels);
  return labels;
}

/**
 * Make the assistant's script fail to load (from the chat server, a preview, or the local
 * dev server), as when the chat server is down. Call before the first navigation.
 */
export async function blockAssistantScript(context: BrowserContext): Promise<void> {
  await context.route(/lc-chatbot\.umd\.cjs|localhost:5173\/src\/main\.js/, (route) => route.abort());
}

export class LibraryAssistantPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /** Label set for the active interface language (defaults to English). */
  private get L(): LALabelSet {
    return labelsFor(this.language === LANGUAGES.HE ? LANGUAGES.HE : LANGUAGES.EN);
  }

  /**
   * Visible menu-item texts expected in the More-options dropdown, in order, with
   * the panel floating (call `ensureFloating()` first). The "Settings" item only
   * renders for staff/moderator accounts (the chatbot's `is-moderator` branch), so
   * pass the account's moderator status.
   */
  expectedMenuTexts(isModerator: boolean): string[] {
    return isModerator
      ? [this.L.settingsMenuText, ...this.L.menuTextsBase]
      : [...this.L.menuTextsBase];
  }

  // --- Element accessors (all pierce the open shadow root) ---

  private get host() {
    return this.page.locator('lc-chatbot');
  }

  private get container() {
    return this.page.locator('lc-chatbot .lc-chatbot-container');
  }

  private get panel() {
    return this.page.getByRole('dialog', { name: this.L.chatWindow });
  }

  private get triggerBtn() {
    return this.page.getByRole('button', { name: this.L.openAssistant });
  }

  private get closeBtn() {
    return this.page.getByRole('button', { name: this.L.close });
  }

  private get dockBtn() {
    return this.page.getByRole('button', { name: this.L.dock });
  }

  private get undockBtn() {
    return this.page.getByRole('button', { name: this.L.undock });
  }

  private get textarea() {
    return this.page.getByLabel(this.L.promptInput);
  }

  private get sendBtn() {
    return this.page.getByRole('button', { name: this.L.send });
  }

  private get userMessages() {
    return this.page.locator('.message.user');
  }

  /** Assistant answers only: not the welcome bubble (inside `.empty-state`),
   *  the loading bubble (no `.message-content`) or the per-chat limit notice. */
  private get answers() {
    return this.page.locator('.message.assistant:not(.limit-message):not(.empty-state *):has(.message-content)');
  }

  private get stopBtn() {
    return this.page.getByRole('button', { name: this.L.stop, exact: true });
  }

  private get thinkingIndicator() {
    return this.page.locator('.lc-thinking-block');
  }

  private get moreOptionsBtn() {
    return this.page.getByRole('button', { name: this.L.moreOptions });
  }

  /** The dropdown `role="menu"` rendered inside `.menu-container` when open. */
  private get menuDropdown() {
    return this.page.getByRole('menu');
  }

  /** All `role="menuitem"` elements inside the open dropdown. */
  private get menuItems() {
    return this.page.getByRole('menuitem');
  }

  /** The `.empty-state` div visible when there are no conversation messages. */
  private get emptyState() {
    return this.page.locator('.empty-state');
  }

  /** The messages log container (role="log"). Scoped to the component so it
   *  doesn't collide with any other live region on the page, and so we don't
   *  depend on the (language-specific) accessible name. */
  private get messagesLog() {
    return this.host.getByRole('log');
  }

  // --- High-level waits / state helpers ---

  async waitForReady(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.host).toHaveCount(1, { timeout: t(15000) });
  }

  /**
   * Assert the `<lc-chatbot>` element does not mount on the current page.
   * Waits a short grace period so async injection doesn't produce a false pass,
   * then asserts the element stays absent.
   */
  async expectNotPresent(graceMs = 5000): Promise<void> {
    await this.page.waitForTimeout(t(graceMs));
    await expect(this.host).toHaveCount(0);
  }

  /** Assert the component mounted in the expected interface language (`en` / `he`). */
  async expectInterfaceLang(): Promise<void> {
    const expected = this.language === LANGUAGES.HE ? 'he' : 'en';
    await expect(this.host).toHaveAttribute('interface-lang', expected, { timeout: t(10000) });
  }

  async isPanelOpen(): Promise<boolean> {
    try {
      return await this.panel.isVisible({ timeout: t(1500) });
    } catch {
      return false;
    }
  }

  async ensureClosed(): Promise<void> {
    if (await this.isPanelOpen()) {
      await this.closeBtn.click();
      await expect(this.panel).toBeHidden({ timeout: t(5000) });
    }
  }

  async ensureOpen(): Promise<void> {
    if (!(await this.isPanelOpen())) {
      await this.triggerBtn.click();
      await expect(this.panel).toBeVisible({ timeout: t(5000) });
    }
  }

  async ensureFloating(): Promise<void> {
    await this.ensureOpen();
    const isDocked = await this.undockBtn.isVisible({ timeout: t(1500) }).catch(() => false);
    if (isDocked) {
      await this.undockBtn.click();
      await expect(this.container).toHaveClass(/mode-floating/, { timeout: t(5000) });
    }
  }

  // --- Assertions / actions used by individual tests ---

  // UX-001: trigger pill visible when panel is closed
  async expectTriggerVisible(): Promise<void> {
    await expect(this.triggerBtn).toBeVisible({ timeout: t(10000) });
  }

  // UX-003: click trigger → panel opens, trigger hides, textarea is focused
  async clickTriggerAndExpectOpen(): Promise<void> {
    await expect(this.triggerBtn).toBeVisible({ timeout: t(10000) });
    await this.triggerBtn.click();
    await expect(this.panel).toBeVisible({ timeout: t(5000) });
    await expect(this.triggerBtn).toBeHidden({ timeout: t(5000) });
    await expect(this.textarea).toBeFocused({ timeout: t(3000) });
  }

  // UX-004: close button closes panel
  async clickCloseAndExpectClosed(): Promise<void> {
    await expect(this.closeBtn).toBeVisible({ timeout: t(5000) });
    await this.closeBtn.click();
    await expect(this.panel).toBeHidden({ timeout: t(5000) });
    await expect(this.triggerBtn).toBeVisible({ timeout: t(5000) });
  }

  // UX-013: floating → docked
  async toggleToDocked(): Promise<void> {
    await expect(this.dockBtn).toBeVisible({ timeout: t(5000) });
    await this.dockBtn.click();
    await expect(this.container).toHaveClass(/mode-docked/, { timeout: t(5000) });
    await expect(this.undockBtn).toBeVisible({ timeout: t(5000) });
  }

  // UX-014: docked → floating
  async toggleToFloating(): Promise<void> {
    await expect(this.undockBtn).toBeVisible({ timeout: t(5000) });
    await this.undockBtn.click();
    await expect(this.container).toHaveClass(/mode-floating/, { timeout: t(5000) });
    await expect(this.dockBtn).toBeVisible({ timeout: t(5000) });
  }

  // UX-022 / UX-023 helpers
  async clearInput(): Promise<void> {
    await this.textarea.fill('');
  }

  async expectSendDisabled(): Promise<void> {
    await expect(this.sendBtn).toBeDisabled({ timeout: t(3000) });
  }

  async expectSendEnabled(): Promise<void> {
    await expect(this.sendBtn).toBeEnabled({ timeout: t(3000) });
  }

  // Compose + send
  async typeMessage(text: string): Promise<void> {
    await this.textarea.fill(text);
  }

  async sendViaEnter(): Promise<void> {
    await this.textarea.press('Enter');
  }

  async sendViaButton(): Promise<void> {
    await this.sendBtn.click();
  }

  async expectUserMessageShown(text: string): Promise<void> {
    await expect(this.userMessages.last()).toContainText(text, { timeout: t(5000) });
  }

  /** An answer arrived and it isn't a failed one. Unlike `waitForResponse()`,
   *  which only waits for the input to re-enable (that also happens after an error). */
  async expectAnswerShown(): Promise<void> {
    const answer = this.answers.last();
    await expect(answer).toBeVisible({ timeout: t(60000) });
    await expect(answer).not.toHaveClass(/\bfailed\b/);
    await expect(answer.locator('.message-content')).not.toBeEmpty();
  }

  async expectInputCleared(): Promise<void> {
    await expect(this.textarea).toHaveValue('', { timeout: t(5000) });
  }

  /** Assert the prompt textarea is focused and enabled (used after restart). */
  async expectTextareaEnabled(): Promise<void> {
    await expect(this.textarea).toBeEnabled({ timeout: t(5000) });
  }

  // UX-027: while an answer is being written, the input is disabled and the Send
  // button is replaced by a Stop button. These only last until the answer is done
  // (about a second against a local backend), so none of them may wait for the end.
  async expectInputDisabledAndStopShownDuringSend(): Promise<void> {
    await expect(this.thinkingIndicator).toBeVisible({ timeout: t(5000) });
    await expect(this.textarea).toBeDisabled({ timeout: t(5000) });
    await expect(this.stopBtn).toBeVisible({ timeout: t(5000) });
    await expect(this.sendBtn).toHaveCount(0, { timeout: t(5000) });
  }

  // Wait for response → textarea re-enables
  async waitForResponse(timeoutMs = 60000): Promise<void> {
    await expect(this.textarea).toBeEnabled({ timeout: t(timeoutMs) });
  }

  // UX-036: thinking indicator appears while awaiting a response.
  // The indicator starts on "Thinking" and then rotates through other messages
  // ("Searching the library", ...), so accept any of them.
  async expectThinkingVisible(): Promise<void> {
    await expect(this.thinkingIndicator).toBeVisible({ timeout: t(10000) });
    const anyMessage = new RegExp(this.L.thinkingMessages.map(escapeRegExp).join('|'));
    await expect(this.thinkingIndicator).toContainText(anyMessage, { timeout: t(5000) });
  }

  async expectThinkingGone(): Promise<void> {
    await expect(this.thinkingIndicator).toBeHidden({ timeout: t(60000) });
  }

  // UX-057 / UX-058 / UX-059: header More-options menu
  async openHeaderMenu(): Promise<void> {
    await expect(this.moreOptionsBtn).toBeVisible({ timeout: t(5000) });
    await this.moreOptionsBtn.click();
    await expect(this.menuDropdown).toBeVisible({ timeout: t(3000) });
  }

  async expectMenuVisible(): Promise<void> {
    await expect(this.menuDropdown).toBeVisible({ timeout: t(3000) });
  }

  async expectMenuHidden(): Promise<void> {
    await expect(this.menuDropdown).toBeHidden({ timeout: t(3000) });
  }

  /**
   * Assert the menu has the expected number of items and their visible text
   * matches (substring) each string in `texts`, in order. Pass
   * `pm.onLibraryAssistant().expectedMenuTexts(isModerator)` for the active language.
   */
  async expectMenuItemTexts(texts: string[]): Promise<void> {
    await expect(this.menuItems).toHaveCount(texts.length, { timeout: t(5000) });
    for (let i = 0; i < texts.length; i++) {
      await expect(this.menuItems.nth(i)).toContainText(texts[i], { timeout: t(3000) });
    }
  }

  /** Close the open menu by pressing Escape. */
  async closeMenuWithEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.expectMenuHidden();
  }

  /**
   * Close the open menu by clicking outside it (in the messages log area).
   * Avoids clicking header buttons that would trigger other actions. The open menu
   * hangs down over the top of the log, so click the part of the log below it.
   */
  async clickOutsideMenu(): Promise<void> {
    const menu = await this.menuDropdown.boundingBox();
    const log = await this.messagesLog.boundingBox();
    if (!menu || !log) throw new Error('the open menu and the messages log should both be on screen');
    const y = Math.max(log.y, menu.y + menu.height) + 10;
    if (y >= log.y + log.height) throw new Error('the open menu covers the whole messages log');
    await this.page.mouse.click(log.x + 10, y);
    await this.expectMenuHidden();
  }

  // UX-060: restart conversation
  /**
   * Click "Restart conversation" inside the already-open menu.
   * The menu must already be open (call `openHeaderMenu()` first).
   */
  async clickRestartConversation(): Promise<void> {
    await this.menuDropdown.getByRole('menuitem', { name: this.L.restartMenuItemAria }).click();
  }

  /** Assert the empty-state welcome panel is visible (no conversation messages). */
  async expectEmptyState(): Promise<void> {
    await expect(this.emptyState).toBeVisible({ timeout: t(5000) });
  }

  /** Assert there are no user-sent message bubbles in the log. */
  async expectNoUserMessages(): Promise<void> {
    await expect(this.userMessages).toHaveCount(0, { timeout: t(5000) });
  }

  // --- The assistant's saved chat in the browser (localStorage, `lc_chatbot:` keys) ---

  /** Mark the free answers as used up, as the widget does at the limit; shown after a reload. */
  async seedFreeAnswersUsedUp(): Promise<void> {
    await this.page.evaluate(() => localStorage.setItem('lc_chatbot:anon_limit_reached', 'true'));
  }

  // --- Sefaria's sign-up options in the login prompt (light DOM, the widget's signup-options slot) ---

  private get signupOptions() {
    return this.page.locator('lc-chatbot > [slot="signup-options"]');
  }

  /** One option: 'google' | 'apple' | 'email'. */
  signupOption(provider: 'google' | 'apple' | 'email') {
    return this.signupOptions.locator(`[data-provider="${provider}"]`);
  }

  /** Which of Google / Apple this sandbox has client IDs for (Email is always offered). */
  async configuredProviders(): Promise<Array<'google' | 'apple' | 'email'>> {
    const ids = await this.page.evaluate(() => ({
      google: !!(window as any).Sefaria?.googleClientId,
      apple: !!(window as any).Sefaria?.appleClientId,
    }));
    return [...(ids.google ? ['google' as const] : []), ...(ids.apple ? ['apple' as const] : []), 'email'];
  }

  async expectSignupOptionsShown(): Promise<void> {
    for (const provider of await this.configuredProviders()) {
      await expect(this.signupOption(provider)).toBeVisible({ timeout: t(10000) });
    }
  }

  async expectSignupOptionsHidden(): Promise<void> {
    await expect(this.signupOption('email')).toBeHidden();
  }

  async expectNoSignupOptions(): Promise<void> {
    await expect(this.signupOptions).toHaveCount(0);
  }

  /** Sefaria rendered its options into <lc-chatbot>, but they don't show in the page. */
  async expectSignupOptionsRenderedButNotShown(): Promise<void> {
    await expect(this.signupOptions).toHaveCount(1);
    await expect(this.signupOptions).toBeHidden();
  }

  /** Google's real (invisible) button sits inside the Google circle; the click itself can't be automated. */
  async expectGoogleButtonOverGoogleOption(): Promise<void> {
    await expect(this.signupOption('google').locator('.sefaria-provider-sdk-overlay iframe')).toHaveCount(1, { timeout: t(15000) });
  }

  /** Stub Apple's popup, so a click on the Apple option starts sign-up without leaving the page. */
  async stubAppleSignIn(): Promise<void> {
    await this.page.waitForFunction(() => (window as any).AppleID?.auth, null, { timeout: t(15000) });
    await this.page.evaluate(() => {
      (window as any).AppleID.auth.signIn = () => new Promise(() => {});
    });
  }

  /** Record GA4 events from here on (Sefaria's sign-up analytics go through window.gtag). */
  async recordAnalyticsEvents(): Promise<void> {
    await this.page.evaluate(() => {
      (window as any).__gaEvents = [];
      (window as any).gtag = (command: string, name: string, params: object) => {
        if (command === 'event') (window as any).__gaEvents.push({ name, ...params });
      };
    });
  }

  async analyticsEvents(): Promise<Array<Record<string, any>>> {
    return this.page.evaluate(() => (window as any).__gaEvents || []);
  }

  /** Put a saved chat in localStorage, as a logged-in user's session leaves it. */
  async seedSavedChat(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.setItem('lc_chatbot:session', JSON.stringify({ sessionId: 'sess_e2e', lastActivity: new Date().toISOString() }));
      localStorage.setItem('lc_chatbot:messages:sess_e2e', JSON.stringify([{ role: 'user', content: 'a saved question' }]));
    });
  }

  /** The `lc_chatbot:` localStorage keys currently on this origin. */
  async savedChatKeys(): Promise<string[]> {
    return this.page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('lc_chatbot:')));
  }
}
