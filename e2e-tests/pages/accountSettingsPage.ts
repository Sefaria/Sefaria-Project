<<<<<<< HEAD
import { Page, expect } from "@playwright/test";
import { HelperBase } from "./helperBase";

export class AccountSettingsPage extends HelperBase {
    constructor(page: Page, language: string) {
        super(page, language);
    }

    async goto() {
        await this.page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    }

    loginMethodsSection() {
        return this.page.locator('#login-methods');
    }

    googleSection() {
        return this.page.locator('#login-methods-google');
    }

    appleSection() {
        return this.page.locator('#login-methods-apple');
    }

    disconnectGoogleBtn() {
        return this.page.locator('#disconnect-google-btn');
    }

    disconnectAppleBtn() {
        return this.page.locator('#disconnect-apple-btn');
    }

    connectGoogleContainer() {
        return this.page.locator('#connect-google-button');
    }

    connectAppleContainer() {
        return this.page.locator('#appleid-signin');
    }

    googleErrorMsg() {
        return this.page.locator('#login-methods-google-msg');
    }

    appleErrorMsg() {
        return this.page.locator('#login-methods-apple-msg');
    }

    /** Injects an error message directly into the provider's error span, simulating the
     *  JS error handler that runs after a failed fetch. Used to test error display without
     *  going through the full OAuth flow. */
    async injectErrorMessage(provider: 'google' | 'apple', message: string) {
        const msgId = provider === 'google' ? 'login-methods-google-msg' : 'login-methods-apple-msg';
        await this.page.evaluate(
            ({ id, msg }) => {
                const el = document.getElementById(id);
                if (el) { el.textContent = msg; el.style.display = 'block'; }
            },
            { id: msgId, msg: message }
        );
    }

    /** Triggers the unlink fetch directly and pipes the result into the UI error span. */
    async triggerUnlinkFetch(provider: 'google' | 'apple') {
        const msgId = provider === 'google' ? 'login-methods-google-msg' : 'login-methods-apple-msg';
        await this.page.evaluate(
            async ({ prov, id }) => {
                const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
                const r = await fetch(`/api/auth/unlink/${prov}`, {
                    method: 'DELETE',
                    headers: { 'X-CSRFToken': csrf },
                });
                const data = await r.json();
                if (data.error) {
                    const el = document.getElementById(id);
                    if (el) { el.textContent = data.error; el.style.display = 'block'; }
                }
            },
            { prov: provider, id: msgId }
        );
    }

    /** Triggers the link fetch with a fake token and pipes the result into the UI error span. */
    async triggerLinkFetch(provider: 'google' | 'apple') {
        const msgId = provider === 'google' ? 'login-methods-google-msg' : 'login-methods-apple-msg';
        const body = provider === 'google'
            ? JSON.stringify({ credential: 'fake-credential' })
            : JSON.stringify({ id_token: 'fake-token' });

        await this.page.evaluate(
            async ({ prov, id, reqBody }) => {
                const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
                const r = await fetch(`/api/auth/link/${prov}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
                    body: reqBody,
                });
                const data = await r.json();
                if (data.error) {
                    const el = document.getElementById(id);
                    if (el) { el.textContent = data.error; el.style.display = 'block'; }
                }
            },
            { prov: provider, id: msgId, reqBody: body }
        );
    }

    async assertGoogleStatus(status: 'Connected' | 'Not connected') {
        await expect(this.googleSection()).toContainText(`Google: ${status}`);
    }

    async assertAppleStatus(status: 'Connected' | 'Not connected') {
        await expect(this.appleSection()).toContainText(`Apple: ${status}`);
    }
=======
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

  async selectTextualCustom(custom: 'sephardi' | 'ashkenazi') {
    const option = this.textualCustomSection.locator(`.toggleOption[data-value="${custom}"]`);
    await option.click();
    await expect(option).toHaveClass(/on/);
  }

  async saveSettings() {
    // Click the last save button (there are multiple)
    await this.saveButtons.last().click();

    // Wait for alert dialog to appear and handle it
    this.page.once('dialog', async dialog => {
      expect(dialog.message()).toMatch(/Settings Saved|הגדרות נשמרו/i);
      await dialog.accept();
    });

    // Wait a bit for the save operation to complete
    await this.page.waitForTimeout(t(1000));
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
>>>>>>> master
}
