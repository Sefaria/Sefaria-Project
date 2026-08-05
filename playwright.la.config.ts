import { defineConfig, devices } from '@playwright/test';

/**
 * Library Assistant opt-out suite (sc-46240).
 *
 * Separate from `playwright.config.ts` on purpose. That config builds every project's
 * baseURL out of `SANDBOX_URL` as `https://www.<domain>` / `https://voices.<domain>`, and
 * its `global-setup.ts` logs four fixed QA accounts into a two-domain sandbox. None of
 * that is reachable at `http://localhost:8000`, and this suite has to run there first —
 * against a Phase 1 checkout before the migration exists anywhere else.
 *
 * Point it elsewhere with LA_BASE_URL:
 *   LA_BASE_URL=https://www.sefariastaging.org npx playwright test --config=playwright.la.config.ts
 *
 * LA_PHASE selects the expectations for the one cohort whose correct answer differs
 * across the rollout: `pre` (default) before the Phase 2 migration, `post` after it.
 * Phase 3 also runs with `post`.
 */

const BASE_URL = process.env.LA_BASE_URL || 'http://localhost:8000';

export default defineConfig({
  testDir: './e2e-tests/library-assistant-setting',
  outputDir: './e2e-tests/e2e-test-logs/la-test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // Two workers by default, not the usual full parallelism. The intended local target is
  // `manage.py runserver` over sqlite, which serializes writes and renders the reader page
  // slowly enough that four workers turn registration and settings saves into timeouts.
  // Raise it with LA_WORKERS when pointing at a cauldron or staging.
  workers: process.env.CI ? 1 : Number(process.env.LA_WORKERS || 2),
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: process.env.GENERATE_REPORTS
    ? [['list', { printSteps: true }], ['html', { outputFolder: './e2e-tests/e2e-test-logs/la-html-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // A local runserver has no valid certificate chain and a cauldron may use a
    // short-lived one; the suite asserts on application behavior, not on TLS.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'la-setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'la-setting',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['la-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
