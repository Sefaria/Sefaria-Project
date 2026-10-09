/**
 * Playwright Auth Setup
 *
 * Authenticates a real user via the SSO JSON login endpoint and saves
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

setup('authenticate via SSO login API', async ({ page }) => {
  const { email, password } = testUser;

  if (!email || !password) {
    throw new Error(
      'PLAYWRIGHT_USER_EMAIL and PLAYWRIGHT_USER_PASSWORD environment variables are required.\n' +
      'Usage: PLAYWRIGHT_USER_EMAIL=user@example.com PLAYWRIGHT_USER_PASSWORD=secret npx playwright test --project=authenticated'
    );
  }

  // Step 1: Navigate to any page served by Django to get a csrftoken cookie.
  // /login now renders the SSO React page (static/js/auth/LoginView.jsx), which has
  // no server-rendered <form> or csrfmiddlewaretoken field to scrape — it submits via
  // the JSON endpoint below itself. Django's CsrfViewMiddleware still sets the
  // csrftoken cookie on this first GET regardless of what the page renders.
  await page.goto('/login');
  const cookies = await page.context().cookies();
  const csrfToken = cookies.find((c) => c.name === 'csrftoken')?.value;
  if (!csrfToken) {
    throw new Error('Could not find csrftoken cookie after loading /login');
  }

  // Step 2: POST credentials to the SSO JSON login endpoint (sso/views.py:email_login).
  // This is session-based (not JWT) — same mechanism the SSO React login page itself
  // uses — and sets the sessionid cookie in this browser context on success.
  const response = await page.request.post('/api/auth/login', {
    headers: {
      'X-CSRFToken': csrfToken,
      'Content-Type': 'application/json',
      Referer: new URL('/login', page.url()).toString(),
    },
    data: { email, password },
  });

  // Step 3: Verify login succeeded. email_login returns 200 {} on success and
  // 401 {error, ...} on bad credentials or an SSO-only account — so status alone
  // (not just "ok()") is the right check here.
  expect(response.status(), await response.text().catch(() => '')).toBe(200);

  // Step 4: Verify the sessionid cookie was actually set.
  // storageState() serializes cookies + localStorage — if no sessionid is in
  // the jar, the saved file won't authenticate any downstream test.
  const sessionCookies = await page.context().cookies();
  const sessionCookie = sessionCookies.find((c) => c.name === 'sessionid');
  expect(sessionCookie, 'sessionid cookie was not set after login').toBeTruthy();

  // Step 5: Pin the interface language to English for downstream tests.
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
