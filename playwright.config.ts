import { defineConfig, devices } from '@playwright/test';

// load environment variables from .env file in the e2e-tests directory
if (!process.env.CI) {
  const env = require('dotenv').config({ path: './e2e-tests/.env' }).parsed;
  process.env = {  ...process.env,
    ...env,
  };
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e-tests',
  /* Output directory for test results */
  outputDir: './e2e-tests/e2e-test-logs/test-results',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* timeout for each test */
  timeout: 220000,

  /* timeout for each expect */
  expect: {
    timeout: 9000,
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
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    /* Record video on failure */
    video: 'retain-on-failure',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    // Main Testing for Production Site
    {
      name: 'chromium',
      testDir: './e2e-tests/tests', // Only run production tests by default
      use: {
        ...devices['Desktop Chrome'],
        // Ensure we don't get redirected
        geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
        permissions: ['geolocation'],
      },
    },

    // Library-specific modularization tests
    {
      name: 'library',
      testDir: './e2e-tests/library-specific',
      use: {
        ...devices['Desktop Chrome'],
          baseURL: process.env.SANDBOX_URL || 'https://modularization.cauldron.sefaria.org',
        // Ensure we don't get redirected
        geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
        permissions: ['geolocation'],
      },
    },

    // Voices-specific modularization tests
    {
      name: 'voices',
      testDir: './e2e-tests/voices-specific',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SANDBOX_URL ? process.env.SANDBOX_URL.replace('modularization', 'voices.modularization') : 'https://voices.modularization.cauldron.sefaria.org',
        // Ensure we don't get redirected
        geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
        permissions: ['geolocation'],
      },
    },
    {
      name: 'misc',
      testDir: './e2e-tests/Misc',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SANDBOX_URL || 'https://modularization.cauldron.sefaria.org',
        // Ensure we don't get redirected
        geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
        permissions: ['geolocation'],
      },
    },

    // OLD Modularization tests (keep temporarily for reference, can be removed later)
    {
      name: 'mdl-old',
      testDir: './e2e-tests/modularization-tests',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.SANDBOX_URL || 'https://modularization.cauldron.sefaria.org',
        // Ensure we don't get redirected
        geolocation: { latitude: 40.7128, longitude: -74.0060 }, // NYC
        permissions: ['geolocation'],
      },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

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
