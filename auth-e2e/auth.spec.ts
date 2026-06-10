import { test, expect, Page } from '@playwright/test';

/**
 * Live e2e coverage of the React auth page (spec 1602) against a running instance.
 * Covers the full spec functionality: render, content-swap, cross-flow, login error,
 * One Tap suppression, register form, and the forgot-password flow.
 */

const heading = (p: Page) => p.locator('.sefaria-auth-card-heading');
const cardSub = (p: Page) => p.locator('.sefaria-auth-card-sub');

test.describe('Auth page (live) — spec 1602', () => {
  test('/login renders the React Sign In card with SSO + email + legal', async ({ page }) => {
    await page.goto('/login');
    await expect(heading(page)).toHaveText('Sign In');
    await expect(page.locator('.sefaria-auth-stack .sefaria-provider-button')).toHaveCount(2);
    await expect(page.locator('button.auth-primary')).toContainText('Continue with Email');
    await expect(page.locator('.sefaria-divider')).toContainText('or');
    await expect(page.locator('.sefaria-legal-text a')).toHaveCount(2);
  });

  test('Google One Tap is suppressed on /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#g_id_onload')).toHaveCount(0);
  });

  test('content-swap to email login keeps the URL and shows the form', async ({ page }) => {
    await page.goto('/login');
    const headerBox = await page.locator('#s2.headerOnly').boundingBox();
    const chooseCardBox = await page.locator('.sefaria-auth-card').boundingBox();
    expect(headerBox && chooseCardBox && chooseCardBox.y - headerBox.height).toBe(56);

    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    const emailCardBox = await page.locator('.sefaria-auth-card').boundingBox();
    expect(headerBox && emailCardBox && emailCardBox.y - headerBox.height).toBe(56);
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('.sefaria-input-trailingLink')).toHaveText('Forgot password?');
    await expect(page.locator('button.auth-primary')).toContainText('Sign In');
    await expect(page).toHaveURL(/\/login\/?$/);
  });

  test('typing persists in the inputs (no event-pooling crash)', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.locator('input[name="email"]').fill('nobody@example.com');
    await page.locator('input[name="password"]').fill('wrongpassword');
    await expect(page.locator('input[name="email"]')).toHaveValue('nobody@example.com');
    await expect(page.locator('input[name="password"]')).toHaveValue('wrongpassword');
  });

  test('bad credentials surface the server error from /api/auth/login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.locator('input[name="email"]').fill(`nobody-${Date.now()}@example.com`);
    await page.locator('input[name="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('.sefaria-auth-error')).toContainText('incorrect');
  });

  test('cross-flow: Sign Up switches to the register flow without navigating', async ({ page }) => {
    await page.goto('/login');
    await cardSub(page).getByRole('link', { name: 'Sign Up' }).click();
    await expect(heading(page)).toHaveText('Create an Account');
    await expect(page).toHaveURL(/\/login\/?$/); // content swap, not a page nav
  });

  test('/register renders the register choose screen', async ({ page }) => {
    await page.goto('/register');
    await expect(heading(page)).toHaveText('Create an Account');
    await expect(cardSub(page).getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(page.locator('.sefaria-auth-stack .sefaria-provider-button')).toHaveCount(2);
  });

  test('register email form shows the fields in Figma order', async ({ page }) => {
    await page.goto('/register');
    const headerBox = await page.locator('#s2.headerOnly').boundingBox();
    const chooseCardBox = await page.locator('.sefaria-auth-card').boundingBox();
    expect(headerBox && chooseCardBox && chooseCardBox.y - headerBox.height).toBe(56);

    await page.getByRole('button', { name: 'Continue with Email' }).click();
    const emailCardBox = await page.locator('.sefaria-auth-card').boundingBox();
    expect(headerBox && emailCardBox && emailCardBox.y - headerBox.height).toBe(56);
    await expect(page.locator('.sefaria-input-label')).toHaveText([
      'Email Address', 'Password', 'First Name', 'Last Name',
    ]);
    await expect(page.locator('button.auth-primary')).toContainText('Create Account');
  });

  test('forgot-password flow reaches the confirmation', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.getByText('Forgot password?').click();
    await expect(heading(page)).toHaveText('Forgot Password?');
    await page.locator('input[name="email"]').fill('someone@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(heading(page)).toHaveText('Reset Link Sent');
  });
});
