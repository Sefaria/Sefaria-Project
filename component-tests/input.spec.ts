import { test, expect } from '@playwright/test';

/** Build a Storybook story iframe URL. */
const story = (id: string) => `/iframe.html?viewMode=story&id=${id}`;

test.describe('Input component (Figma `Input Field`)', () => {
  test('password reveal toggles masking and aria-pressed', async ({ page }) => {
    await page.goto(story('common-input--password-masked'));
    const input = page.locator('input.sefaria-input-control');
    const toggle = page.locator('button.sefaria-input-reveal');

    await expect(input).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('error state sets aria-invalid and an alert message', async ({ page }) => {
    await page.goto(story('common-input--placeholder-error'));
    const input = page.locator('input.sefaria-input-control');

    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('required');
    // a11y: the input must point at the error node
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toBeVisible();
  });

  test('filled/error keeps the value and red-bordered control', async ({ page }) => {
    await page.goto(story('common-input--filled-error'));
    await expect(page.locator('input.sefaria-input-control')).toHaveValue('not-an-email');
    await expect(page.locator('.sefaria-input--error')).toBeVisible();
  });

  test('Hebrew variant renders RTL', async ({ page }) => {
    await page.goto(story('common-input--hebrew-label-error'));
    await expect(page.locator('.sefaria-input')).toHaveAttribute('dir', 'rtl');
  });

  test('with-link variant renders the trailing link', async ({ page }) => {
    await page.goto(story('common-input--with-forgot-link'));
    await expect(page.locator('.sefaria-input-trailingLink')).toHaveText('Forgot password?');
  });

  test('disabled variant disables the control', async ({ page }) => {
    await page.goto(story('common-input--disabled'));
    await expect(page.locator('input.sefaria-input-control')).toBeDisabled();
  });
});
