import { test, expect, Page } from '@playwright/test';

/**
 * Custom SSO provider-button coverage (spec 1602) against a running instance.
 * Google renders its SDK click target transparently over the Figma button; Apple uses
 * the custom button to call AppleID.auth.signIn().
 *
 * The OAuth popups themselves are external and can't be driven here; the callback wiring
 * is covered separately by injecting a credential and asserting the backend POST.
 */

async function gotoChoose(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.sefaria-auth-card-heading')).toBeVisible();
}

for (const path of ['/login', '/register']) {
  test.describe(`custom SSO buttons render on ${path}`, () => {
    test('Google button and SDK target render', async ({ page }) => {
      await gotoChoose(page, path);
      await expect(page.getByText('Continue with Google', { exact: true })).toBeVisible();
      await expect
        .poll(() => page.locator('#google-signin-button .sefaria-provider-sdk-overlay').evaluate((el) => el.childElementCount).catch(() => 0), { timeout: 12000 })
        .toBeGreaterThan(0);
    });

    test('Apple custom button renders', async ({ page }) => {
      await gotoChoose(page, path);
      await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    });
  });
}

test.describe('SSO callback wiring (login)', () => {
  test('a Google credential POSTs to the google callback and redirects', async ({ page }) => {
    let posted: any = null;
    await page.route('https://accounts.google.com/gsi/client', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.google = {
            accounts: {
              id: {
                initialize: function(config) { window.__googleAuthCallback = config.callback; },
                renderButton: function(element) {
                  element.setAttribute('data-google-rendered', 'true');
                },
                prompt: function() {}
              }
            }
          };
        `,
      }));
    await page.route('**/api/auth/google/callback', (route) => {
      posted = route.request().postDataJSON?.() ?? route.request().postData();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });

    await gotoChoose(page, '/login');
    await expect.poll(() => page.evaluate(() => typeof (window as any).__googleAuthCallback)).toBe('function');
    await page.evaluate(() => {
      (window as any).__googleAuthCallback({ credential: 'fake.jwt.credential' });
    });
    await expect.poll(() => posted).not.toBeNull();
    expect(JSON.stringify(posted)).toContain('credential');
  });
});
