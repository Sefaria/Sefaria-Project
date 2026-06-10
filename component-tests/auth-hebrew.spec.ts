import { expect, test } from '@playwright/test';

const story = (id: string) => `/iframe.html?viewMode=story&id=${id}`;

test.describe('Hebrew auth flow matches Figma Hebrew Examples', () => {
  test('login choose uses Hebrew typography, RTL provider order, and Figma spacing', async ({ page }) => {
    await page.goto(story('auth-authpage--hebrew-login'));

    const card = page.locator('.sefaria-auth-card');
    await expect(card).toHaveAttribute('dir', 'rtl');
    await expect(card).toHaveCSS('max-width', '640px');
    await expect(card).toHaveCSS('padding-top', '56px');

    const heading = card.locator('.sefaria-auth-card-heading');
    await expect(heading).toHaveText('התחברות');
    await expect(heading).toHaveCSS('font-family', /Heebo/);
    await expect(heading).toHaveCSS('font-size', '40px');
    await expect(heading).toHaveCSS('font-weight', '500');

    const google = card.locator('#google-signin-button');
    await expect(google).toContainText('להמשיך עם גוגל');
    const iconBox = await google.locator('.sefaria-provider-button-icon').boundingBox();
    const labelBox = await google.getByText('להמשיך עם גוגל').boundingBox();
    expect(iconBox && labelBox && iconBox.x).toBeGreaterThan(labelBox?.x || 0);

    await expect(card.locator('.sefaria-divider')).toHaveText('או');
    await expect(card.locator('.sefaria-legal-text')).toContainText('המשך מהווה הסכמה');
  });

  test('email login keeps Hebrew chrome RTL and Latin credentials LTR', async ({ page }) => {
    await page.goto(story('auth-authpage--hebrew-login'));

    const authPage = page.locator('.sefaria-auth-page');
    const chooseCardBox = await page.locator('.sefaria-auth-card').boundingBox();
    const authPageBox = await authPage.boundingBox();
    expect(chooseCardBox && authPageBox && chooseCardBox.y - authPageBox.y).toBe(56);

    await page.getByRole('button', { name: 'להמשיך עם אימייל' }).click();

    const card = page.locator('.sefaria-auth-card');
    const emailCardBox = await card.boundingBox();
    expect(emailCardBox && authPageBox && emailCardBox.y - authPageBox.y).toBe(56);
    const emailField = card.locator('.sefaria-input').filter({ has: page.locator('input[name="email"]') });
    await expect(emailField).toHaveAttribute('dir', 'rtl');
    await expect(emailField.locator('.sefaria-input-label')).toHaveText('אימייל');
    await expect(emailField.locator('input')).toHaveAttribute('dir', 'ltr');
    await expect(emailField.locator('input')).toHaveCSS('height', '45px');

    const passwordField = card.locator('.sefaria-input').filter({ has: page.locator('input[name="password"]') });
    await expect(passwordField.locator('.sefaria-input-label')).toHaveText('סיסמא');
    await expect(passwordField.locator('.sefaria-input-trailingLink')).toHaveText('שכחת סיסמא?');

    const labelBox = await passwordField.locator('.sefaria-input-label').boundingBox();
    const linkBox = await passwordField.locator('.sefaria-input-trailingLink').boundingBox();
    expect(labelBox && linkBox && labelBox.x).toBeGreaterThan(linkBox?.x || 0);

    const back = card.locator('.sefaria-auth-card-back');
    const cardBox = await card.boundingBox();
    const backBox = await back.boundingBox();
    expect(cardBox && backBox && backBox.x).toBeGreaterThan((cardBox?.x || 0) + 500);
    await expect(back.locator('img')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  });

  test('registration email state preserves RTL labels and field order', async ({ page }) => {
    await page.goto(story('auth-authpage--hebrew-register'));
    await page.getByRole('button', { name: 'להמשיך עם אימייל' }).click();

    const authPageBox = await page.locator('.sefaria-auth-page').boundingBox();
    const cardBox = await page.locator('.sefaria-auth-card').boundingBox();
    expect(authPageBox && cardBox && cardBox.y - authPageBox.y).toBe(56);
    expect(authPageBox && cardBox && authPageBox.y + authPageBox.height - cardBox.y - cardBox.height).toBe(56);

    const labels = page.locator('.sefaria-input-label');
    await expect(labels).toHaveText(['אימייל', 'סיסמא', 'שם פרטי', 'שם משפחה']);
    await expect(page.locator('input[name="email"]')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('input[name="password"]')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('input[name="first_name"]')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('button.auth-primary')).toHaveText('יצירת חשבון');
    await expect(page.locator('button.auth-primary')).toHaveCSS('font-family', /Heebo/);
    await expect(page.locator('button.auth-primary')).toHaveCSS('font-weight', '700');
  });
});
