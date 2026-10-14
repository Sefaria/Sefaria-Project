import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { LANGUAGES, t } from '../globals';

/**
 * Page object for account settings page
 * URL: /settings/account
 */
export class AccountSettingsPage extends HelperBase {
  constructor(page: Page, language: string) {
    super(page, language);
  }

  // Locators
  get emailNotificationsSection() {
    return this.page.locator('#emailNotifications');
  }

  get siteLanguageSection() {
    return this.page.locator('#siteLanguage');
  }

  get translationLanguageSection() {
    return this.page.locator('#translationLanguagePreference');
  }

  get readingHistorySection() {
    return this.page.locator('#readingHistory');
  }

  get textualCustomSection() {
    return this.page.locator('#textualCustom');
  }

  get emailDisplay() {
    return this.page.locator('#email-display');
  }

  get changeEmailButton() {
    return this.page.locator('#change-email');
  }

  get saveButtons() {
    return this.page.locator('.saveAccountSettingsBtn');
  }

  get cancelButton() {
    return this.page.getByRole('button', { name: this.language === LANGUAGES.EN ? 'Cancel' : 'ביטול' });
  }

  // Actions
  async selectEmailNotificationFrequency(frequency: 'daily' | 'weekly' | 'never') {
    const option = this.emailNotificationsSection.locator(`.toggleOption[data-value="${frequency}"]`);
    await option.click();
    await expect(option).toHaveClass(/on/);
  }

  async selectSiteLanguage(language: 'english' | 'hebrew') {
    const option = this.siteLanguageSection.locator(`.toggleOption[data-value="${language}"]`);
    await option.click();
    await expect(option).toHaveClass(/on/);
  }

  async selectReadingHistory(enabled: boolean) {
    const value = enabled ? 'true' : 'false';
    const option = this.readingHistorySection.locator(`.toggleOption[data-value="${value}"]`);
    await option.click();
    await expect(option).toHaveClass(/on/);
  }

  async selectLibraryAssistant(enabled: boolean) {
    const option = this.page.locator(`#libraryAssistantSetting .toggleOption[data-value="${enabled}"]`);
    await option.click();
    await expect(option).toHaveClass(/on/);
  }

  async selectTextualCustom(custom: 'sephardi' | 'ashkenazi') {
    const option = this.textualCustomSection.locator(`.toggleOption[data-value="${custom}"]`);
    await option.click();
    await expect(option).toHaveClass(/on/);
  }

  /**
   * Saves with the last Save button and accepts the "Settings Saved" alert. The dialog listener
   * is registered before the click: Playwright dismisses a dialog nobody listens for, so a
   * listener added afterwards never sees it.
   */
  async saveSettings() {
    const saved = this.page.waitForResponse(
      r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/profile',
      { timeout: t(30000) },
    );
    const dialog = this.page.waitForEvent('dialog', { timeout: t(30000) });
    await this.saveButtons.last().click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const alert = await dialog;
    const message = alert.message();
    await alert.accept();
    expect(message).toMatch(/Settings Saved|הגדרות נשמרו/i);
  }

  async verifyPageLoaded() {
    await expect(this.page.locator('#accountSettingsPage')).toBeVisible();
    await expect(this.emailNotificationsSection).toBeVisible();
  }

  async verifyEmailDisplayed(email: string) {
    await expect(this.emailDisplay).toHaveValue(email);
  }

  async changeSettings(settings: {
    emailNotifications?: 'daily' | 'weekly' | 'never';
    siteLanguage?: 'english' | 'hebrew';
    readingHistory?: boolean;
    textualCustom?: 'sephardi' | 'ashkenazi';
  }) {
    if (settings.emailNotifications) {
      await this.selectEmailNotificationFrequency(settings.emailNotifications);
    }

    if (settings.siteLanguage) {
      await this.selectSiteLanguage(settings.siteLanguage);
    }

    if (settings.readingHistory !== undefined) {
      await this.selectReadingHistory(settings.readingHistory);
    }

    if (settings.textualCustom) {
      await this.selectTextualCustom(settings.textualCustom);
    }
  }
}
