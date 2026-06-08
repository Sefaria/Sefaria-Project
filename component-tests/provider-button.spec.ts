import { test, expect } from '@playwright/test';

const story = (id: string) => `/iframe.html?viewMode=story&id=${id}`;

test.describe('ProviderButton + auth Button variants (Figma `Buttons [for now]`)', () => {
  test('Google: secondary variant, brand icon, label', async ({ page }) => {
    await page.goto(story('common-providerbutton--google'));
    const btn = page.locator('button.sefaria-common-button.auth-secondary');
    await expect(btn).toContainText('Continue with Google');
    await expect(btn.locator('img.button-icon')).toHaveAttribute('src', /google\.svg/);
    await expect(btn).toBeEnabled();
  });

  test('Apple: secondary variant, brand icon, label', async ({ page }) => {
    await page.goto(story('common-providerbutton--apple'));
    const btn = page.locator('button.sefaria-common-button.auth-secondary');
    await expect(btn).toContainText('Continue with Apple');
    await expect(btn.locator('img.button-icon')).toHaveAttribute('src', /apple\.svg/);
  });

  test('disabled provider button is disabled', async ({ page }) => {
    await page.goto(story('common-providerbutton--google-disabled'));
    await expect(page.locator('button.sefaria-common-button.auth-secondary')).toBeDisabled();
  });

  test('primary email button renders navy auth-primary', async ({ page }) => {
    await page.goto(story('common-providerbutton--auth-button-set'));
    await expect(page.locator('button.auth-primary')).toContainText('Continue with Email');
  });
});
