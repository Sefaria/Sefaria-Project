import { test, expect, Page } from '@playwright/test';

/**
 * Live registration-flow coverage (spec 1602) against a running instance.
 *
 * The dev/test env uses Google's reCAPTCHA *test* key (django_recaptcha's default),
 * so the "I'm not a robot" checkbox always passes — we click it like a real user.
 */

async function gotoRegisterEmail(page: Page) {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Continue with Email' }).click();
  await expect(page.locator('input[name="email"]')).toBeVisible();
}

async function solveTestCaptcha(page: Page) {
  await page.frameLocator('iframe[title="reCAPTCHA"]')
    .getByRole('checkbox', { name: "I'm not a robot" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).grecaptcha?.getResponse?.()?.length || 0))
    .toBeGreaterThan(0);
}

test.describe('Registration flow (live) — spec 1602', () => {
  test('register email form renders the reCAPTCHA widget', async ({ page }) => {
    await gotoRegisterEmail(page);
    await expect(page.locator('#auth-captcha-slot iframe')).toBeVisible();
    await expect(
      page.frameLocator('iframe[title="reCAPTCHA"]').getByRole('checkbox', { name: "I'm not a robot" })
    ).toBeVisible();
  });

  test('submitting without solving the captcha is blocked with a clear error', async ({ page }) => {
    await gotoRegisterEmail(page);
    await page.locator('input[name="email"]').fill(`nobody-${Date.now()}@example.com`);
    await page.locator('input[name="password"]').fill('SuperSecret123');
    await page.locator('input[name="first_name"]').fill('No');
    await page.locator('input[name="last_name"]').fill('Body');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.locator('.sefaria-auth-error')).toBeVisible();
    await expect(page.locator('.sefaria-auth-error')).toContainText('robot');
    await expect(page).toHaveURL(/\/register\/?$/); // stayed put — no account created
  });

  test('solving the captcha submits a complete request and redirects', async ({ page }) => {
    let captured: { ct: string; body: string } | null = null;
    await page.route('**/register', (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        captured = { ct: req.headers()['content-type'] || '', body: req.postData() || '' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ redirect: '/texts' }) });
      }
      return route.continue();
    });

    await gotoRegisterEmail(page);
    await page.locator('input[name="email"]').fill('someone@example.com');
    await page.locator('input[name="password"]').fill('SuperSecret123');
    await page.locator('input[name="first_name"]').fill('Some');
    await page.locator('input[name="last_name"]').fill('One');
    await solveTestCaptcha(page);
    await page.getByRole('button', { name: 'Create Account' }).click();

    await page.waitForURL('**/texts');
    expect(captured!.ct).toContain('application/x-www-form-urlencoded');
    expect(captured!.body).toContain('password1=SuperSecret123');
    expect(captured!.body).toContain('first_name=Some');
    expect(captured!.body).toContain('last_name=One');
    expect(captured!.body).toContain('noredirect=1');
    expect(captured!.body).toMatch(/g-recaptcha-response=[^&]+/); // non-empty token included
  });

  // Opt-in true end-to-end (creates a REAL account). Run with REGISTER_LIVE=1.
  test('full registration creates an account and logs in', async ({ page }) => {
    test.skip(process.env.REGISTER_LIVE !== '1', 'Set REGISTER_LIVE=1 to run (creates a real user)');
    await gotoRegisterEmail(page);
    await page.locator('input[name="email"]').fill(`akiva10b+pw${Date.now()}@gmail.com`);
    await page.locator('input[name="password"]').fill('SuperSecret123');
    await page.locator('input[name="first_name"]').fill('Akiva');
    await page.locator('input[name="last_name"]').fill('Tester');
    await solveTestCaptcha(page);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await page.waitForURL(/\/texts/);
  });
});
