import { expect, Page } from '@playwright/test';
import { HelperBase } from './helperBase';
import { LANGUAGES } from '../globals';

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

  async selectTextualCustom(custom: 'sephardi' | 'ashkenazi') {
    const option = this.textualCustomSection.locator(`.toggleOption[data-value="${custom}"]`);
    await option.click();
    await expect(option).toHaveClass(/on/);
  }

  async saveSettings() {
    // Click the first save button (there are multiple)
    await this.saveButtons.first().click();

    // Wait for alert dialog to appear and handle it
    this.page.once('dialog', async dialog => {
      expect(dialog.message()).toMatch(/Settings Saved|הגדרות נשמרו/i);
      await dialog.accept();
    });

    // Wait a bit for the save operation to complete
    await this.page.waitForTimeout(1000);
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
