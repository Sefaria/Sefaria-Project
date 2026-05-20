import { defineConfig, devices } from '@playwright/test';
import { t } from './e2e-tests/globals';

// load environment variables from .env file in the e2e-tests directory
if (!process.env.CI) {
  const env = require('dotenv').config({ path: './e2e-tests/.env' }).parsed;
  process.env = {
    ...process.env,
    ...env,
  };
}

// Extract domain from SANDBOX_URL
const SANDBOX_DOMAIN = process.env.SANDBOX_URL?.replace(/^https?:\/\//, '').replace(/^www\./, '')
const SANDBOX_DOMAIN_IL = process.env.SANDBOX_URL_IL?.replace(/^https?:\/\//, '').replace(/^www\./, '')
const MODULE_URLS = {
  EN: {
    LIBRARY: `https://www.${SANDBOX_DOMAIN}`,
    VOICES: `https://voices.${SANDBOX_DOMAIN}`
  },
  HE: {
    LIBRARY: `https://www.${SANDBOX_DOMAIN_IL}`,
    VOICES: `https://chiburim.${SANDBOX_DOMAIN_IL}`
  }
} as const;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e-tests',
  /* Output directory for test results */
  outputDir: './e2e-tests/e2e-test-logs/test-results',
  /* Log in every test account once before any worker starts and write a
   * read-only storage-state file per profile. See e2e-tests/global-setup.ts. */
  globalSetup: './e2e-tests/global-setup.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* timeout for each test */
  timeout: t(50000),

  /* timeout for each expect */
  expect: {
    timeout: t(10000),
  },


  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['github']]
    : process.env.GENERATE_REPORTS
      ? [
        ['list', { printSteps: true }],
        ['html', { outputFolder: './e2e-tests/e2e-test-logs/html-report' }],
        ['junit', { outputFile: './e2e-tests/e2e-test-logs/junit-results.xml' }]
      ]
      : [['list', { printSteps: true }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.SANDBOX_URL,

    /* Make browser appear to be in the US */
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
    permissions: ['geolocation'],

    /* Set US-specific HTTP headers */
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on failure */
    video: 'retain-on-failure',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    // Library-specific tests
    {
      name: 'chrome-library',
      testDir: './e2e-tests/library',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    // Voices-specific tests
    {
      name: 'chrome-voices',
      testDir: './e2e-tests/voices',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: MODULE_URLS.EN.VOICES,
      },
    },
    {
      name: 'chrome-misc',
      testDir: './e2e-tests/Misc',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'chrome-sanity',
      testDir: './e2e-tests/Sanity',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    // Library Assistant (chatbot) tests — run on Library module with LA-whitelisted user
    {
      name: 'chrome-assistant',
      testDir: './e2e-tests/assistant',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    // Resource Panel (ConnectionsPanel) feature-coverage tests — Library module
    {
      name: 'chrome-resource-panel',
      testDir: './e2e-tests/Full testing by Feature/Resource Panel',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },

    // Firefox - Library-specific modularization tests
    {
      name: 'firefox-library',
      testDir: './e2e-tests/library',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    // Firefox - Voices-specific modularization tests
    {
      name: 'firefox-voices',
      testDir: './e2e-tests/voices',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: MODULE_URLS.EN.VOICES,
      },
    },
    // Firefox - Misc tests
    {
      name: 'firefox-misc',
      testDir: './e2e-tests/Misc',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'firefox-sanity',
      testDir: './e2e-tests/Sanity',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'firefox-assistant',
      testDir: './e2e-tests/assistant',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'firefox-resource-panel',
      testDir: './e2e-tests/Full testing by Feature/Resource Panel',
      use: {
        ...devices['Desktop Firefox'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },

    // Safari - Library-specific modularization tests
    {
      name: 'safari-library',
      testDir: './e2e-tests/library',
      use: {
        ...devices['Desktop Safari'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    // Safari - Voices-specific modularization tests
    {
      name: 'safari-voices',
      testDir: './e2e-tests/voices',
      use: {
        ...devices['Desktop Safari'],
        baseURL: MODULE_URLS.EN.VOICES,
      },
    },
    // WebKit - Misc tests
    {
      name: 'safari-misc',
      testDir: './e2e-tests/Misc',
      use: {
        ...devices['Desktop Safari'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'safari-sanity',
      testDir: './e2e-tests/Sanity',
      use: {
        ...devices['Desktop Safari'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'safari-assistant',
      testDir: './e2e-tests/assistant',
      use: {
        ...devices['Desktop Safari'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },
    {
      name: 'safari-resource-panel',
      testDir: './e2e-tests/Full testing by Feature/Resource Panel',
      use: {
        ...devices['Desktop Safari'],
        baseURL: MODULE_URLS.EN.LIBRARY,
      },
    },



    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ..devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
