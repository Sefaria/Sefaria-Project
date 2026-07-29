/**
 * AUTH PAGE — ChooseView / LoginView / RegisterView / ForgotView (UMN-A0NN)
 *
 * Coverage for the React AuthPage state machine (static/js/auth/AuthPage.jsx
 * and siblings) introduced by the SSO branch, which replaced the old
 * server-rendered login/register templates. UMN-001 in user-menu.spec.ts
 * already covers the golden-path login (via the now ChooseView-aware
 * LoginPage.loginAs) — this file covers the surrounding flows: navigation
 * between login/register, client-side validation, and error states.
 *
 * A real Google/Apple SSO round-trip and a real captcha-gated registration
 * both need live third-party credentials this suite doesn't have — see
 * e2e-tests/CLAUDE.md #18 for the interception pattern used below instead.
 */

import { test, expect, Page } from '@playwright/test';
import { goToPageWithLang, hideAllModalsAndPopups, openHeaderDropdown, selectDropdownOption } from '../../utils';
import { LANGUAGES, testUser, t } from '../../globals';
import { PageManager } from '../../pages/pageManager';
import { MODULE_URLS } from '../../constants';

test.describe('Auth Page', () => {
  let page: Page;
  let pm: PageManager;

  test.beforeEach(async ({ context }) => {
    page = await goToPageWithLang(context, MODULE_URLS.EN.LIBRARY, LANGUAGES.EN);
    pm = new PageManager(page, LANGUAGES.EN);
    await hideAllModalsAndPopups(page);
  });

  test('UMN-A01: ChooseView is the landing view for /login and /register; crosslinks swap both heading and URL', async () => {
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');
    await expect(page).toHaveURL(/\/login/, { timeout: t(15000) });
    await expect(page.getByRole('heading', { name: /^Log in$/i })).toBeVisible({ timeout: t(10000) });
    await expect(page.getByRole('button', { name: 'Continue with Email' })).toBeVisible();

    await page.getByRole('link', { name: /^Sign up$/i }).click();
    await expect(page).toHaveURL(/\/register/, { timeout: t(15000) });
    await expect(page.getByRole('heading', { name: /^Create Account$/i })).toBeVisible({ timeout: t(10000) });

    await page.getByRole('link', { name: /^Log In$/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: t(15000) });
    await expect(page.getByRole('heading', { name: /^Log in$/i })).toBeVisible({ timeout: t(10000) });
  });

  test('UMN-A02: Wrong password on the login form shows an inline error and does not navigate away', async () => {
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');
    await pm.onLoginPage().clickContinueWithEmail();

    await page.getByLabel('Email Address').fill(testUser.email);
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: /^Log in$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/incorrect/i, { timeout: t(10000) });
    await expect(page).toHaveURL(/\/login/);
  });

  test('UMN-A03: Unknown email on the login form shows the same generic inline error (no account enumeration)', async () => {
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');
    await pm.onLoginPage().clickContinueWithEmail();

    await page.getByLabel('Email Address').fill(`nobody-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('whatever123');
    await page.getByRole('button', { name: /^Log in$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/incorrect/i, { timeout: t(10000) });
  });

  test('UMN-A04: Valid credentials on the login form land the user authenticated', { tag: '@sanity' }, async () => {
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');
    await pm.onLoginPage().loginAs(testUser);

    await hideAllModalsAndPopups(page);
    expect(await pm.onModuleHeader().isLoggedIn()).toBe(true);
  });

  test('UMN-A05: Register form required-field validation sets on blur, clears on typing', async () => {
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Sign up');
    await pm.onSignUpPage().clickContinueWithEmail();

    const emailField = page.getByLabel('Email Address');
    await emailField.click();
    await page.keyboard.press('Tab'); // blur without typing anything
    await expect(page.getByText('Required field')).toBeVisible({ timeout: t(5000) });

    await emailField.fill('a@test.com');
    await expect(page.getByText('Required field')).toHaveCount(0, { timeout: t(5000) });
  });

  test('UMN-A06: Registering with an already-used email shows the "already exists" error', async () => {
    // Django's form.is_valid() also fails the (unsolved) captcha field here, but
    // RegisterView.jsx explicitly ignores a `captcha` key in the error response
    // (ErrorBanner only reflects the email-exists error) — see EMAIL_EXISTS_ERRORS
    // handling in RegisterView.jsx. So this is reachable without solving reCAPTCHA.
    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Sign up');
    await pm.onSignUpPage().clickContinueWithEmail();

    await pm.onSignUpPage().fillNewUser(testUser.email, 'Xk7mQ9zLp2!', 'QA', 'Automation');
    await page.getByRole('button', { name: /^Create Account$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/already exists/i, { timeout: t(15000) });
    await expect(page).toHaveURL(/\/register/);
  });

  test('UMN-A07: A successful register POST redirects the browser (reCAPTCHA-independent)', async () => {
    // A real successful registration needs a solved reCAPTCHA against a live
    // site key, which CI cannot do — intercept the endpoint (e2e-tests/CLAUDE.md
    // #18) to verify RegisterView's success handling without creating a real
    // account. Only the POST is intercepted; the initial GET that renders the
    // page must reach the real server.
    await page.route('**/register', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ redirect: '/texts' }) });
    });

    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Sign up');
    await pm.onSignUpPage().clickContinueWithEmail();
    await pm.onSignUpPage().fillNewUser(`playwright-${Date.now()}@example.com`, 'Xk7mQ9zLp2!', 'QA', 'Automation');
    await page.getByRole('button', { name: /^Create Account$/i }).click();

    await expect(page).toHaveURL(/\/texts/, { timeout: t(15000) });
  });

  test('UMN-A08: Forgot-password submits the reset request and shows the confirmation message', async () => {
    // password reset emails are a real side effect — intercept per
    // e2e-tests/CLAUDE.md #18 and assert on the captured request body instead
    // of letting a real email go out.
    let requestBody: string | null = null;
    await page.route('**/api/auth/password/reset', async (route) => {
      requestBody = route.request().postData();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');
    await pm.onLoginPage().clickContinueWithEmail();
    await page.getByRole('link', { name: /Forgot Password\?/i }).click();

    await expect(page.getByRole('heading', { name: /^Forgot Password\?$/i })).toBeVisible({ timeout: t(10000) });
    await page.getByLabel('Email Address').fill(testUser.email);
    await page.getByRole('button', { name: /^Send Reset Link$/i }).click();

    await expect(page.getByRole('heading', { name: /^Reset Link Sent$/i })).toBeVisible({ timeout: t(10000) });
    expect(requestBody).not.toBeNull();
    expect(JSON.parse(requestBody as string)).toEqual({ email: testUser.email });
  });
});
