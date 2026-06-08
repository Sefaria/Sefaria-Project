import { expect, Page, Route, test } from '@playwright/test';

type GoogleInitializeCall = {
  client_id?: string;
  ux_mode?: string;
  login_uri?: string;
  hasCallback: boolean;
};

async function mockProviderSdks(page: Page) {
  await page.route('https://accounts.google.com/gsi/client', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.__ssoTest = window.__ssoTest || {
          googleInitializeCalls: [],
          googleRenderCalls: [],
          googlePromptCalls: 0,
          appleInitCalls: []
        };
        window.google = {
          accounts: {
            id: {
              initialize: function(config) {
                window.__ssoTest.googleInitializeCalls.push({
                  client_id: config.client_id,
                  ux_mode: config.ux_mode,
                  login_uri: config.login_uri,
                  hasCallback: typeof config.callback === 'function'
                });
              },
              renderButton: function(element, options) {
                window.__ssoTest.googleRenderCalls.push(options);
                if (element) {
                  element.setAttribute('data-sso-test-rendered', 'google');
                }
              },
              prompt: function() {
                window.__ssoTest.googlePromptCalls += 1;
              }
            }
          }
        };
      `,
    });
  });

  await page.route('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.__ssoTest = window.__ssoTest || {
          googleInitializeCalls: [],
          googleRenderCalls: [],
          googlePromptCalls: 0,
          appleInitCalls: []
        };
        window.AppleID = {
          auth: {
            init: function(config) {
              window.__ssoTest.appleInitCalls.push({
                clientId: config.clientId,
                redirectURI: config.redirectURI,
                state: config.state,
                usePopup: config.usePopup
              });
            }
          }
        };
      `,
    });
  });
}

async function latestGoogleInitializeCall(page: Page): Promise<GoogleInitializeCall> {
  await expect.poll(async () => {
    return page.evaluate(() => window.__ssoTest?.googleInitializeCalls?.length || 0);
  }).toBeGreaterThan(0);

  return page.evaluate(() => {
    const calls = window.__ssoTest.googleInitializeCalls;
    return calls[calls.length - 1];
  });
}

async function latestAppleInitCall(page: Page) {
  await expect.poll(async () => {
    return page.evaluate(() => window.__ssoTest?.appleInitCalls?.length || 0);
  }).toBeGreaterThan(0);

  return page.evaluate(() => {
    const calls = window.__ssoTest.appleInitCalls;
    return calls[calls.length - 1];
  });
}

test.describe('SSO Phase 2 auth page provider behavior', () => {
  test('desktop login initializes Google/Apple as popup and does not prompt One Tap', async ({ page }) => {
    await mockProviderSdks(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const googleCall = await latestGoogleInitializeCall(page);
    expect(googleCall.ux_mode).toBe('popup');
    expect(googleCall.hasCallback).toBe(true);
    expect(googleCall.login_uri).toBeUndefined();

    await expect(page.locator('#google-signin-button[data-sso-test-rendered="google"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__ssoTest?.googlePromptCalls || 0)).toBe(0);

    const appleCall = await latestAppleInitCall(page);
    expect(appleCall.usePopup).toBe(true);
    expect(appleCall.redirectURI).toBe(`${new URL(page.url()).origin}/auth/apple/redirect`);
    expect(appleCall.state).toBeTruthy();
  });

  test('mobile register initializes Google/Apple as redirect and stores signed redirect state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockProviderSdks(page);

    await page.goto('/register?next=/texts', { waitUntil: 'domcontentloaded' });

    const googleCall = await latestGoogleInitializeCall(page);
    expect(googleCall.ux_mode).toBe('redirect');
    expect(googleCall.hasCallback).toBe(false);
    expect(googleCall.login_uri).toBe(`${new URL(page.url()).origin}/auth/google/redirect`);

    const redirectStateCookie = await page.evaluate(() => {
      return document.cookie.split('; ').find(cookie => cookie.startsWith('sso_redirect_state='));
    });
    expect(redirectStateCookie).toBeTruthy();

    const appleCall = await latestAppleInitCall(page);
    expect(appleCall.usePopup).toBe(false);
    expect(appleCall.redirectURI).toBe(`${new URL(page.url()).origin}/auth/apple/redirect`);
    expect(appleCall.state).toBeTruthy();
  });

  test('registration AJAX renders provider-specific SSO-only links from structured errors', async ({ page }) => {
    await mockProviderSdks(page);
    await page.route('**/register', async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          email: 'This email is already registered via social sign-in. Sign in with a connected provider instead.',
          _auth: {
            code: 'sso_only_account',
            providers: ['Google', 'Apple'],
          },
        }),
      });
    });

    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.locator('#register-form').evaluate((form: HTMLFormElement) => {
      form.noValidate = true;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const error = page.locator('#register-form .errorlist li');
    await expect(error).toContainText('already registered via social sign-in');
    await expect(error.getByRole('link', { name: /Sign in with Google/i })).toHaveAttribute('href', '#google-signin-button');
    await expect(error.getByRole('link', { name: /Sign in with Apple/i })).toHaveAttribute('href', '#appleid-signin');
  });
});

test.describe('SSO Phase 2 Google One Tap gating', () => {
  test('clean anonymous page initializes and prompts Google One Tap', async ({ page, baseURL, context }) => {
    await mockProviderSdks(page);
    await context.addCookies([
      { name: 'cookiesNotificationAccepted', value: '1', url: baseURL || page.url() },
      { name: 'signup_promo_banner_dismissed', value: '1', url: baseURL || page.url() },
      { name: 'chatbot_experiment_banner_dismissed', value: '1', url: baseURL || page.url() },
    ]);

    await page.goto('/texts', { waitUntil: 'domcontentloaded' });

    await expect.poll(() => page.evaluate(() => window.__ssoTest?.googlePromptCalls || 0)).toBe(1);
  });

  test('session marked by interruptive UI suppresses Google One Tap prompt', async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('sefaria_interruptive_ui_seen', '1');
    });
    await mockProviderSdks(page);

    await page.goto('/texts', { waitUntil: 'domcontentloaded' });

    await expect.poll(() => page.evaluate(() => window.__ssoTest?.googlePromptCalls || 0)).toBe(0);
  });
});

declare global {
  interface Window {
    __ssoTest: {
      googleInitializeCalls: GoogleInitializeCall[];
      googleRenderCalls: Array<Record<string, unknown>>;
      googlePromptCalls: number;
      appleInitCalls: Array<{
        clientId?: string;
        redirectURI?: string;
        state?: string;
        usePopup?: boolean;
      }>;
    };
  }
}
