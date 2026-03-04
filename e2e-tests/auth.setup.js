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

export const STORAGE_STATE = path.join(__dirname, '.auth/user.json');

setup('authenticate via Django login', async ({ page }) => {
  const email = process.env.PLAYWRIGHT_USER_EMAIL;
  const password = process.env.PLAYWRIGHT_USER_PASSWORD;

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

  // Verify the session cookie was set by navigating to a page that
  // requires auth context (the newsletter page shows different UI for logged-in users)
  await page.goto('/newsletter');
  await page.waitForSelector('#NewsletterInner', { timeout: 10000 });

  // Confirm the page recognizes us as logged in by checking for the email display
  const emailDisplay = page.locator(`text=${email}`).first();
  await expect(emailDisplay).toBeVisible({ timeout: 5000 });

  // Step 5: Save the authenticated browser state (cookies + localStorage).
  // This file will be loaded by test projects that depend on 'setup'.
  await page.context().storageState({ path: STORAGE_STATE });
});
