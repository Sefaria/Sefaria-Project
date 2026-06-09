import { test, expect } from '@playwright/test';

const story = (id: string) => `/iframe.html?viewMode=story&id=${id}`;

test.describe('AuthPage submit wiring (spec 1602)', () => {
  test('email login error surfaces server message', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Your email or password is incorrect.' }),
      }));
    await page.goto(story('auth-authpage--login-choose'));
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.locator('input[name="email"]').fill('a@b.com');
    await page.locator('input[name="password"]').fill('wrong');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('.sefaria-auth-error')).toContainText('incorrect');
  });

  test('register posts form-encoded to /register (noredirect, password1)', async ({ page }) => {
    let captured: any = null;
    await page.route('**/register', (route) => {
      const req = route.request();
      captured = { method: req.method(), ct: req.headers()['content-type'] || '', body: req.postData() || '' };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: 'bad' }) });
    });
    await page.goto(story('auth-authpage--register-choose'));
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.locator('input[name="email"]').fill('a@b.com');
    await page.locator('input[name="password"]').fill('secret123');
    await page.locator('input[name="first_name"]').fill('Moshe');
    await page.locator('input[name="last_name"]').fill('Rabbenu');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect.poll(() => captured?.method).toBe('POST');
    expect(captured.ct).toContain('application/x-www-form-urlencoded');
    expect(captured.body).toContain('password1=secret123');
    expect(captured.body).toContain('first_name=Moshe');
    expect(captured.body).toContain('noredirect=1');
  });

  test('forgot-password posts to the reset endpoint and shows confirmation', async ({ page }) => {
    let hit = false;
    await page.route('**/api/auth/password/reset', (route) => {
      hit = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });
    await page.goto(story('auth-authpage--login-choose'));
    await page.getByRole('button', { name: 'Continue with Email' }).click();
    await page.getByText('Forgot password?').click();
    await page.locator('input[name="email"]').fill('a@b.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect.poll(() => hit).toBe(true);
    await expect(page.locator('.sefaria-auth-card-heading')).toHaveText('Reset Link Sent');
  });
});
