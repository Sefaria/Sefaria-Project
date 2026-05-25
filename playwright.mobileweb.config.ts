import { defineConfig, devices } from '@playwright/test';
import { t } from './e2e-tests/globals';

if (!process.env.CI) {
  const env = require('dotenv').config({ path: './e2e-tests/.env' }).parsed;
  process.env = { ...process.env, ...env };
}

const SANDBOX_DOMAIN = process.env.SANDBOX_URL?.replace(/^https?:\/\//, '').replace(/^www\./, '');
const SANDBOX_DOMAIN_IL = process.env.SANDBOX_URL_IL?.replace(/^https?:\/\//, '').replace(/^www\./, '');

const MODULE_URLS = {
  EN: {
    LIBRARY: `https://www.${SANDBOX_DOMAIN}`,
    VOICES: `https://voices.${SANDBOX_DOMAIN}`,
  },
  HE: {
    LIBRARY: `https://www.${SANDBOX_DOMAIN_IL}`,
    VOICES: `https://chiburim.${SANDBOX_DOMAIN_IL}`,
  },
} as const;

/**
 * Mobile-only Playwright config.
 *
 * Sefaria's responsive breakpoint for mobile is `width < 843px`
 * (see `static/css/breakpoints.css` --bp-tablet-min). Using Pixel 5 (393×851)
 * keeps us comfortably below that threshold and exercises the same mobile-only
 * components rendered by `Header.jsx` (`<MobileNavMenu>`, `<MobileInterfaceLanguageToggle>`).
 *
 * Run with: `npx playwright test --config=playwright.mobileweb.config.ts`
 */
export default defineConfig({
  testDir: './e2e-tests/mobile web',
  outputDir: './e2e-tests/e2e-test-logs/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: t(60000),

  expect: {
    timeout: t(10000),
  },

  retries: process.env.CI ? 2 : 1,
  // The staging sandbox throttles aggressively under concurrent load — six
  // mobile tests in parallel reliably trigger 5xx on /login and stalls on
  // /texts. Cap workers per project so the suite stays deterministic without
  // having to bump TIMEOUT_MULTIPLIER globally.
  workers: process.env.CI ? 1 : 2,

  reporter: process.env.CI
    ? [['github']]
    : process.env.GENERATE_REPORTS
      ? [
          ['list', { printSteps: true }],
          ['html', { outputFolder: './e2e-tests/e2e-test-logs/html-report-mobile' }],
          ['junit', { outputFile: './e2e-tests/e2e-test-logs/junit-results-mobile.xml' }],
        ]
      : [['list', { printSteps: true }]],

  use: {
    baseURL: MODULE_URLS.EN.LIBRARY,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chrome-mobile-library',
      testDir: './e2e-tests/mobile web',
      use: {
        ...devices['Pixel 5'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'safari-mobile-library',
      testDir: './e2e-tests/mobile web',
      use: {
        ...devices['iPhone 13'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
  ],
});
