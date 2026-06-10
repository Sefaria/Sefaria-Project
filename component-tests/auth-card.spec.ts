import { test, expect } from '@playwright/test';

const story = (id: string) => `/iframe.html?viewMode=story&id=${id}`;

test.describe('AuthCard composition (Figma `Form Card`)', () => {
  test('Sign In choose screen: providers + divider + email + legal, no back', async ({ page }) => {
    await page.goto(story('common-authcard--choose-sign-in'));
    await expect(page.locator('.sefaria-auth-card-heading')).toHaveText('Sign In');
    await expect(page.locator('.sefaria-provider-button')).toHaveCount(2);
    await expect(page.locator('button.auth-primary')).toContainText('Continue with Email');
    await expect(page.locator('.sefaria-divider')).toContainText('or');
    await expect(page.locator('.sefaria-legal-text a')).toHaveCount(2);
    await expect(page.locator('.sefaria-auth-card-back')).toHaveCount(0);
  });

  test('Create Account: back button + 4 inputs in Figma order', async ({ page }) => {
    await page.goto(story('common-authcard--email-register'));
    await expect(page.locator('.sefaria-auth-card-back')).toBeVisible();
    const labels = page.locator('.sefaria-input-label');
    await expect(labels).toHaveCount(4);
    await expect(labels.nth(0)).toHaveText('Email Address');
    await expect(labels.nth(1)).toHaveText('Password');
    await expect(labels.nth(2)).toHaveText('First Name');
    await expect(labels.nth(3)).toHaveText('Last Name');
    await expect(page.locator('button.auth-primary')).toContainText('Create Account');
  });

  test('Captcha error: red outline + alert message', async ({ page }) => {
    await page.goto(story('common-authcard--captcha-error'));
    await expect(page.locator('.sefaria-captcha--error')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('captcha');
  });
});
