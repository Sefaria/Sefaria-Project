import { test, expect, Page } from '@playwright/test';

/**
 * Hebrew interface coverage (spec 1602): every auth string from Penina's sheet must
 * resolve to Hebrew via Sefaria._() when interfaceLang=hebrew. Sets the interfaceLang
 * cookie so the page renders RTL/Hebrew.
 */

test.use({ locale: 'he-IL' });

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'interfaceLang', value: 'hebrew', url: 'http://127.0.0.1:8000' }]);
});

const card = (p: Page) => p.locator('.sefaria-auth-card');

test.describe('Auth strings render in Hebrew', () => {
  test('login choose screen', async ({ page }) => {
    await page.goto('/login');
    await expect(card(page).locator('.sefaria-auth-card-heading')).toHaveText('התחברות');
    await expect(card(page)).toContainText('אין לך חשבון?');           // cross-flow prefix
    await expect(card(page).getByText('להמשיך עם אימייל')).toBeVisible(); // email button
    await expect(card(page).locator('.sefaria-divider')).toContainText('או');
    await expect(card(page).locator('.sefaria-legal-text')).toContainText('מדיניות פרטיות'); // compliance + link
  });

  test('register choose + email form', async ({ page }) => {
    await page.goto('/register');
    await expect(card(page).locator('.sefaria-auth-card-heading')).toHaveText('יצירת חשבון');
    await card(page).getByText('להמשיך עם אימייל').click();
    await expect(card(page)).toContainText('סיסמא');      // Password
    await expect(card(page)).toContainText('שם פרטי');    // First Name
    await expect(card(page)).toContainText('שם משפחה');   // Last Name
    await expect(card(page).locator('button.auth-primary')).toContainText('יצירת חשבון'); // Create Account
  });

  test('login email form: Sign In button + forgot link', async ({ page }) => {
    await page.goto('/login');
    await card(page).getByText('להמשיך עם אימייל').click();
    await expect(card(page).locator('form button.auth-primary')).toContainText('התחברות'); // Sign In
    await expect(card(page).locator('.sefaria-input-trailingLink')).toHaveText('שכחת סיסמא?'); // Forgot password?
  });

  test('forgot-password flow strings', async ({ page }) => {
    await page.goto('/login');
    await card(page).getByText('להמשיך עם אימייל').click();
    await page.getByText('שכחת סיסמה?').click();
    await expect(card(page).locator('.sefaria-auth-card-heading')).toHaveText('שכחת סיסמה?'); // title
    await expect(card(page).locator('button.auth-primary')).toContainText('שליחת קישור לאיפוס'); // Send Reset Link
  });
});
