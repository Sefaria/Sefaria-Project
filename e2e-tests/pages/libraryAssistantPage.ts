import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { hideAllModalsAndPopups } from '../utils';
import { t } from '../globals';

/**
 * Page object for the Sefaria Library Assistant (`<lc-chatbot>` web component).
 *
 * The LA mounts an open shadow root on `www.sefaria.org` for whitelisted users.
 * Playwright's default engine pierces open shadow DOM for role/label/CSS
 * locators, so everything here uses `page.*` directly — no special pierce syntax.
 */
export class LibraryAssistantPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // --- Element accessors (all pierce the open shadow root) ---

  private get host() {
    return this.page.locator('lc-chatbot');
  }

  private get container() {
    return this.page.locator('lc-chatbot .lc-chatbot-container');
  }

  private get panel() {
    return this.page.getByRole('dialog', { name: 'Chat window' });
  }

  private get triggerBtn() {
    return this.page.getByRole('button', { name: 'Open Library Assistant' });
  }

  private get closeBtn() {
    return this.page.getByRole('button', { name: 'Close assistant' });
  }

  private get dockBtn() {
    return this.page.getByRole('button', { name: 'Dock assistant to side' });
  }

  private get undockBtn() {
    return this.page.getByRole('button', { name: 'Undock assistant' });
  }

  private get menuBtn() {
    return this.page.getByRole('button', { name: 'More options' });
  }

  private get textarea() {
    return this.page.getByLabel('Prompt input');
  }

  private get sendBtn() {
    return this.page.getByRole('button', { name: 'Send message' });
  }

  private get userMessages() {
    return this.page.locator('.message.user');
  }

  private get thinkingIndicator() {
    return this.page.locator('.thinking-content');
  }

  // --- High-level waits / state helpers ---

  async waitForReady(): Promise<void> {
    await hideAllModalsAndPopups(this.page);
    await expect(this.host).toHaveCount(1, { timeout: t(15000) });
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
}
