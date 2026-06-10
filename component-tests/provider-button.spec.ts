import { test, expect } from '@playwright/test';

const story = (id: string) => `/iframe.html?viewMode=story&id=${id}`;

test.describe('ProviderButton (Figma `Buttons [for now]`)', () => {
  test('Google matches the custom secondary variant', async ({ page }) => {
    await page.goto(story('common-providerbutton--google'));
    const button = page.getByRole('button', { name: 'Continue with Google' });
    await expect(button).toBeVisible();
    await expect(button.locator('img')).toHaveAttribute('src', /google\.svg/);
    await expect(button).toHaveCSS('height', '51px');
    await expect(button).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    // Chromium rasterizes the Figma 1.5px stroke to one device pixel here.
    await expect(button).toHaveCSS('border-top-width', '1px');
    await expect(button).toHaveCSS('border-top-color', 'rgb(24, 52, 93)');
    await expect(button).toHaveCSS('border-top-style', 'solid');
  });

  test('Apple renders its custom brand button', async ({ page }) => {
    await page.goto(story('common-providerbutton--apple'));
    const button = page.getByRole('button', { name: 'Continue with Apple' });
    await expect(button.locator('img')).toHaveAttribute('src', /apple\.svg/);
    await expect(button).toHaveText('Continue with Apple');
    await expect(button.locator('button')).toHaveCount(0);
  });

  test('hover and disabled states match the Figma tokens', async ({ page }) => {
    await page.goto(story('common-providerbutton--google'));
    const button = page.getByRole('button', { name: 'Continue with Google' });
    await button.hover();
    await expect(button).toHaveCSS('background-color', 'rgb(240, 247, 255)');

    await page.goto(story('common-providerbutton--google-disabled'));
    const disabled = page.getByRole('button', { name: 'Continue with Google' });
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveCSS('background-color', 'rgb(230, 230, 230)');
    await expect(disabled).toHaveCSS('color', 'rgb(153, 153, 153)');
  });

  test('Hebrew variant uses RTL labels', async ({ page }) => {
    await page.goto(story('common-providerbutton--hebrew'));
    await expect(page.getByRole('button', { name: 'להמשיך עם גוגל' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'להמשיך עם אפל' })).toBeVisible();
  });
});
