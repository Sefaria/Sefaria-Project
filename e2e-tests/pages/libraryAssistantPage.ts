import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { LANGUAGES, t } from '../globals';

/**
 * Page object for the Sefaria Library Assistant (`<lc-chatbot>` web component).
 *
 * The LA mounts an open shadow root for whitelisted users. Playwright's default
 * engine pierces open shadow DOM for role/label/CSS locators, so everything here
 * uses `page.*` directly — no special pierce syntax.
 *
 * **Bilingual.** The deployed component runs a svelte-i18n build (`interface-lang`
 * = `en` / `he`) and renders every label from a catalog. This POM is therefore
 * language-parameterized: all visible/aria labels come from `LA_LABELS[this.language]`.
 * The strings below were captured from the LIVE deployed component (not guessed
 * from source) in both English and Hebrew — see assistant/README.md §"Label reference".
 */

type LALabelSet = {
  openAssistant: string;
  triggerLabel: string;
  chatWindow: string;
  close: string;
  dock: string;
  undock: string;
  moreOptions: string;
  promptInput: string;
  send: string;
  /** aria-label of the "Restart conversation" menu item. */
  restartMenuItemAria: string;
  /** The moderator-only first menu item ("Settings"), shown only when `is-moderator`. */
  settingsMenuText: string;
  /** Visible menu-item texts in order that EVERY user sees (excludes "Settings"). */
  menuTextsBase: string[];
};

export const LA_LABELS: Record<string, LALabelSet> = {
  [LANGUAGES.EN]: {
    openAssistant: 'Open Library Assistant',
    triggerLabel: 'LIBRARY ASSISTANT',
    chatWindow: 'Chat window',
    close: 'Close',
    dock: 'Dock Assistant',
    undock: 'Undock Assistant',
    moreOptions: 'More options',
    promptInput: 'Prompt input',
    send: 'Send',
    restartMenuItemAria: 'Restart convo',
    settingsMenuText: 'Settings',
    menuTextsBase: ['Restart chat', 'Give feedback', 'Help', 'Opt out in Settings'],
  },
  [LANGUAGES.HE]: {
    openAssistant: 'פתיחת עוזר הספרייה',
    triggerLabel: 'עוזר הספרייה',
    chatWindow: 'חלון שיחה',
    close: 'סגירה',
    dock: 'הצמדת עוזר הספרייה',
    undock: 'חזרה למצב צף',
    moreOptions: 'אפשרויות נוספות',
    promptInput: 'שדה טקסט',
    send: 'שליחה',
    restartMenuItemAria: 'התחלת שיחה מחדש',
    settingsMenuText: 'הגדרות',
    menuTextsBase: ['התחלת שיחה מחדש', 'שליחת משוב', 'עזרה', 'כיבוי בהגדרת'],
  },
};

export class LibraryAssistantPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  /** Label set for the active interface language (defaults to English). */
  private get L(): LALabelSet {
    return LA_LABELS[this.language] ?? LA_LABELS[LANGUAGES.EN];
  }

  /**
   * Visible menu-item texts expected in the More-options dropdown, in order.
   * The "Settings" item only renders for staff/moderator accounts (the chatbot's
   * `is-moderator` branch), so pass the account's moderator status.
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

  private get thinkingIndicator() {
    return this.page.locator('.thinking-content');
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

  async expectInputCleared(): Promise<void> {
    await expect(this.textarea).toHaveValue('', { timeout: t(5000) });
  }

  /** Assert the prompt textarea is focused and enabled (used after restart). */
  async expectTextareaEnabled(): Promise<void> {
    await expect(this.textarea).toBeEnabled({ timeout: t(5000) });
  }

  // UX-027: input + send disabled during in-flight send
  async expectInputDisabledDuringSend(): Promise<void> {
    await expect(this.textarea).toBeDisabled({ timeout: t(5000) });
    await expect(this.sendBtn).toBeDisabled({ timeout: t(5000) });
    await expect(this.thinkingIndicator).toBeVisible({ timeout: t(5000) });
  }

  // Wait for response → textarea re-enables
  async waitForResponse(timeoutMs = 60000): Promise<void> {
    await expect(this.textarea).toBeEnabled({ timeout: t(timeoutMs) });
  }

  // UX-036: thinking indicator appears while awaiting a response.
  // NOTE: the deployed component renders the thinking label as "Thinking" in BOTH
  // English and Hebrew interfaces (the Hebrew string is not yet wired in prod), so
  // this assertion is intentionally language-invariant.
  async expectThinkingVisible(): Promise<void> {
    await expect(this.thinkingIndicator).toBeVisible({ timeout: t(10000) });
    await expect(this.thinkingIndicator).toContainText('Thinking', { timeout: t(5000) });
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
   * Avoids clicking header buttons that would trigger other actions.
   */
  async clickOutsideMenu(): Promise<void> {
    await this.messagesLog.click({ position: { x: 50, y: 50 } });
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
}
