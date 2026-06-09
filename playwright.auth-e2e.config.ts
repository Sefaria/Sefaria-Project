import { defineConfig } from '@playwright/test';

/**
 * Live e2e tests for the React auth page (spec 1602), run against a running Sefaria
 * instance. Defaults to the local dev server; override with AUTH_BASE_URL.
 *
 * Prereqs: dev server running + `npm run build-login` (and static served).
 * Run:  npx playwright test --config playwright.auth-e2e.config.ts
 */
export default defineConfig({
  testDir: './auth-e2e',
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.AUTH_BASE_URL || 'http://127.0.0.1:8000',
    actionTimeout: 10_000,
  },
});
