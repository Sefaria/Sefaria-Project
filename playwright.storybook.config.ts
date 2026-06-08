import { defineConfig } from '@playwright/test';

/**
 * Component test config — runs Playwright assertions against the built static
 * Storybook (storybook-static/). Separate from the root playwright.config.ts,
 * which targets the remote sandbox for full-page e2e.
 *
 * Usage:
 *   npm run build-storybook
 *   npx playwright test --config playwright.storybook.config.ts
 */
export default defineConfig({
  testDir: './component-tests',
  // The static Storybook is served by Python's single-threaded http.server,
  // which drops sockets under concurrent load — run serially.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:6018',
  },
  webServer: {
    command: 'python3 -m http.server 6018 -d storybook-static',
    url: 'http://localhost:6018/iframe.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
