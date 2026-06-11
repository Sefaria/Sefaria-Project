/**
 * Playwright Auth Setup
 *
 * Authenticates a real user via Django's /login/ endpoint and saves
 * the session state (cookies including sessionid) to a JSON file.
 * Other test projects that depend on this setup will start with
 * the saved session, making all API calls work with real auth.
 *
 * Usage:
 *   PLAYWRIGHT_USER_EMAIL=user@example.com \
 *   PLAYWRIGHT_USER_PASSWORD=secret \
 *   SANDBOX_URL=http://localhost:8000 \
 *   npx playwright test --project=setup
 *
 * The setup runs automatically when running the 'authenticated' project.
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { testUser } from './globals';

export const STORAGE_STATE = path.join(__dirname, '.auth/setup_session.json');

setup('authenticate via Django login', async ({ page }) => {
  const { email, password } = testUser;

  if (!email || !password) {
    throw new Error(
      'PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD environment variables are required.\n' +
      'Usage: PLAYWRIGHT_USER_EMAIL=user@example.com PLAYWRIGHT_USER_PASSWORD=secret npx playwright test --project=authenticated'
    );
  }

  // Step 1: Navigate to the login page to get the CSRF token.
  // Django's CsrfViewMiddleware sets the csrftoken cookie on the first GET,
  // and the login form template embeds it as a hidden input field.
  await page.goto('/login');
  // The CSRF token is in a type="hidden" input, so wait for it to be attached (not visible)
  await page.waitForSelector('input[name="csrfmiddlewaretoken"]', { state: 'attached', timeout: 10000 });

  // Step 2: Extract the CSRF token from the hidden form field.
  const csrfToken = await page.locator('input[name="csrfmiddlewaretoken"]').getAttribute('value');
  if (!csrfToken) {
    throw new Error('Could not extract CSRF token from login form');
  }

  // Step 3: POST login credentials directly via API (no UI form filling).
  // page.request shares the browser context's cookie jar, so:
  //   - The csrftoken cookie (set by the GET above) is sent automatically
  //   - The sessionid cookie (set by Django on success) is captured automatically
  const response = await page.request.post('/login/', {
    form: {
      email: email,
      password: password,
      csrfmiddlewaretoken: csrfToken,
    },
  });

  // Step 4: Verify login succeeded.
  // Django's LoginView redirects to LOGIN_REDIRECT_URL on success (302).
  // Playwright follows redirects by default, so we check the final status.
  expect(response.ok()).toBeTruthy();

  // Step 5: Verify the sessionid cookie was actually set.
  // storageState() serializes cookies + localStorage — if no sessionid is in
  // the jar, the saved file won't authenticate any downstream test. A 200 OK
  // alone isn't sufficient: Django re-renders the login page (with errors) at
  // 200 OK when credentials are wrong, so the cookie check is what proves the
  // login itself succeeded vs. the page just rendering.
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === 'sessionid');
  expect(sessionCookie, 'sessionid cookie was not set after login').toBeTruthy();

  // Step 6: Pin the interface language to English for downstream tests.
  // For logged-in users the language priority is profile > cookie (see
  // LanguageSettingsMiddleware.process_request), so a cookie alone won't
  // override a Hebrew profile. Hitting /interface/english triggers
  // interface_language_redirect, which writes both the cookie AND
  // profile.settings.interface_language. The downstream authenticated
  // tests assert on English UI strings, so this makes them deterministic
  // regardless of the test user's prior saved language preference.
  await page.goto('/interface/english?next=/');

  // Step 7: Save the authenticated browser state (cookies + localStorage).
  // This file will be loaded by test projects that depend on 'setup'.
  await page.context().storageState({ path: STORAGE_STATE });
});
