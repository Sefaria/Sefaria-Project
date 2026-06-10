import { test, expect } from '@playwright/test';

const story = (id: string) => `/iframe.html?viewMode=story&id=${id}`;
const heading = (page) => page.locator('.sefaria-auth-card-heading');

test.describe('AuthPage state machine (spec 1602)', () => {
  test('login choose → email form (content swap)', async ({ page }) => {
    await page.goto(story('auth-authpage--login-choose'));
    await expect(heading(page)).toHaveText('Sign In');
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('.sefaria-input-trailingLink')).toHaveText('Forgot password?');
    await expect(page.locator('button.auth-primary')).toContainText('Sign In');
  });

  test('cross-flow: Sign Up switches to register', async ({ page }) => {
    await page.goto(story('auth-authpage--login-choose'));
    await page.getByRole('link', { name: 'Sign Up' }).click();
    await expect(heading(page)).toHaveText('Create an Account');
  });

  test('forgot-password view reachable from email login', async ({ page }) => {
    await page.goto(story('auth-authpage--login-choose'));
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.getByText('Forgot password?').click();
    await expect(heading(page)).toHaveText('Forgot Password?');
  });

  test('back button returns to choose', async ({ page }) => {
    await page.goto(story('auth-authpage--login-choose'));
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.locator('.sefaria-auth-card-back').click();
    await expect(heading(page)).toHaveText('Sign In');
  });

  test('register email form has first/last name + Create Account', async ({ page }) => {
    await page.goto(story('auth-authpage--register-choose'));
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await expect(page.locator('input[name="first_name"]')).toBeVisible();
    await expect(page.locator('input[name="last_name"]')).toBeVisible();
    await expect(page.locator('button.auth-primary')).toContainText('Create Account');
  });
});
