/**
 * AUTH PAGE — ChooseView / LoginView / RegisterView / ForgotView / reset-confirm views (UMN-ANN)
 *
 * Coverage for the React AuthPage state machine (static/js/auth/AuthPage.jsx
 * and siblings). UMN-001 in user-menu.spec.ts already covers the golden-path
 * login (via the ChooseView-aware LoginPage.loginAs) — this file covers the
 * surrounding flows: navigation between login/register, client-side
 * validation, and error states.
 *
 * The reset-confirm views (ResetExpiredView and the "Reset Link Sent" state it leads to) are
 * reached from /password/reset/confirm/<uid>/<token>/. The valid-link form and its success state
 * are NOT covered here: they need a token only the server can mint, and that token stops working
 * as soon as global-setup logs the test user in (last_login is part of the token hash). Jest
 * (AuthPage.test.js, ResetView.test.js) and Django (password_reset_confirm_view_test.py) cover them.
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

  test('UMN-A09: Reset Link Sent offers a Log In button that returns to the sign-in choice screen', async () => {
    await page.route('**/api/auth/password/reset', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await openHeaderDropdown(page, 'user');
    await selectDropdownOption(page, 'Log in');
    await pm.onLoginPage().clickContinueWithEmail();
    await page.getByRole('link', { name: /Forgot Password\?/i }).click();
    await page.getByLabel('Email Address').fill(testUser.email);
    await page.getByRole('button', { name: /^Send Reset Link$/i }).click();
    await expect(page.getByRole('heading', { name: /^Reset Link Sent$/i })).toBeVisible({ timeout: t(10000) });

    // Scoped to the card: the header (present at /login) has its own Log in control.
    await page.locator('.sefaria-auth-card').getByRole('button', { name: /^Log In$/i }).click();
    await expect(page.getByRole('heading', { name: /^Log in$/i })).toBeVisible({ timeout: t(10000) });
    await expect(page.getByRole('button', { name: 'Continue with Email' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

// The reset-confirm page is a full server-rendered load of a link from an email. The uid below
// is base64 of a pk no account has, so the server renders the expired state, and a missed
// interception below could never email a real user (the real server answers a resend for it
// with no_account_for_link). Only the POST is intercepted; the GET must reach the real server.
test.describe('Auth Page reset-confirm link', () => {
  const RESET_CONFIRM_PATH = '/password/reset/confirm/OTk5OTk5OTk5OTk/bogus-token/';
  const resetConfirmUrl = `${MODULE_URLS.EN.LIBRARY}${RESET_CONFIRM_PATH}`;
  const expiredHeading = { en: /^Password Reset Link Expired$/i, he: 'פג התוקף של הקישור לעדכון סיסמה' };

  async function interceptConfirmPost(page: Page, status: number, body: object) {
    const captured: { body: string | null } = { body: null };
    await page.route('**/password/reset/confirm/**', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      captured.body = route.request().postData();
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    return captured;
  }

  test('UMN-A10: An expired reset link offers a new one, then Reset Link Sent leads back to sign in', async ({ context }) => {
    const page = await goToPageWithLang(context, resetConfirmUrl, LANGUAGES.EN);
    const posted = await interceptConfirmPost(page, 200, {});

    await expect(page.getByRole('heading', { name: expiredHeading.en })).toBeVisible({ timeout: t(15000) });
    await page.getByRole('button', { name: /^Request New Link$/i }).click();

    await expect(page.getByRole('heading', { name: /^Reset Link Sent$/i })).toBeVisible({ timeout: t(10000) });
    expect(posted.body).not.toBeNull();
    expect(JSON.parse(posted.body as string)).toEqual({ action: 'resend' });

    await page.getByRole('button', { name: /^Log In$/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: t(10000) });
    await expect(page.getByRole('heading', { name: /^Log in$/i })).toBeVisible({ timeout: t(10000) });
  });

  test('UMN-A11: A reset link with no matching account shows the no-account banner', async ({ context }) => {
    const page = await goToPageWithLang(context, resetConfirmUrl, LANGUAGES.EN);
    await interceptConfirmPost(page, 400, {
      error: "We couldn't find an account for this link.",
      _auth: { code: 'no_account_for_link' },
    });

    await expect(page.getByRole('heading', { name: expiredHeading.en })).toBeVisible({ timeout: t(15000) });
    await page.getByRole('button', { name: /^Request New Link$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/couldn't find an account for this link/i, { timeout: t(10000) });
    await expect(page.getByRole('button', { name: /^Request New Link$/i })).toHaveCount(0);

    // The banner's link leaves the reset-confirm URL for /login and lands on the manual
    // forgot-password form, where the user can enter an email.
    await page.getByRole('link', { name: /^Request New Link$/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: t(10000) });
    await expect(page.getByRole('heading', { name: /^Forgot Password\?$/i })).toBeVisible({ timeout: t(10000) });
    await expect(page.getByLabel('Email Address')).toBeVisible();
  });

  test('UMN-A12: The expired-link page and Reset Link Sent render in Hebrew', async ({ context }) => {
    const page = await goToPageWithLang(context, resetConfirmUrl, LANGUAGES.HE);
    await interceptConfirmPost(page, 200, {});

    await expect(page.getByRole('heading', { name: expiredHeading.he })).toBeVisible({ timeout: t(15000) });
    await page.getByRole('button', { name: 'בקשה לקישור חדש' }).click();

    await expect(page.getByRole('heading', { name: 'קישור לעדכון סיסמה נשלח' })).toBeVisible({ timeout: t(10000) });
    await expect(page.getByRole('button', { name: 'להתחברות' })).toBeVisible();
  });
});
