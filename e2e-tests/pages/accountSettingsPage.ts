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
}
