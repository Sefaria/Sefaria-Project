/**
 * Behavior-driven (BDD) story tests: Product's Gherkin `.feature` files, run by playwright-bdd.
 *
 * Separate from playwright.config.ts on purpose: its own projects, its own outputDir, and a
 * generation step (`bddgen`) that must run first. Always run it through npm:
 *
 *   npm run test:bdd          # bddgen, then playwright test with this config
 *   npm run bddgen            # generate only (prints snippets for any missing steps)
 *
 * Layout and process: e2e-tests/feature-specs/README.md
 */
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// Same env handling as playwright.config.ts: outside CI, e2e-tests/.env is loaded.
if (!process.env.CI) {
  const env = require('dotenv').config({ path: './e2e-tests/.env' }).parsed;
  process.env = { ...process.env, ...env };
}

// Required after the env is loaded: these modules read process.env at import time.
const { t } = require('./e2e-tests/globals');
const { MODULE_URLS } = require('./e2e-tests/constants');

// Scenarios tagged @manual are documentation only and are never generated.
const ALWAYS_EXCLUDED = 'not @manual';

const bdd = (device: 'desktop' | 'mobile') =>
  defineBddConfig({
    features: 'e2e-tests/feature-specs/features/**/*.feature',
    steps: 'e2e-tests/feature-specs/steps/**/*.ts',
    outputDir: `.features-gen/${device}`,
    // A feature line with no step definition fails generation and prints a ready-to-paste
    // snippet. That is the "red" state an engineer starts from (see feature-specs/README.md).
    // Locally, BDD_MISSING_STEPS=skip-scenario generates the scenarios whose steps all exist, so a
    // feature can be built one scenario at a time. CI never sets it.
    missingSteps: (process.env.BDD_MISSING_STEPS as 'fail-on-gen' | 'skip-scenario' | undefined) ?? 'fail-on-gen',
    tags: device === 'mobile' ? `${ALWAYS_EXCLUDED} and @mobile` : `${ALWAYS_EXCLUDED} and not @mobile`,
  });

export default defineConfig({
  outputDir: './e2e-tests/e2e-test-logs/bdd-results',
  globalSetup: './e2e-tests/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: t(50000),
  expect: { timeout: t(10000) },
  // One retry in CI: a story that only passes on the third try is not a trustworthy gate.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report-bdd', open: 'never' }]]
    : [['list', { printSteps: true }]],
  use: {
    baseURL: MODULE_URLS.EN.LIBRARY,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome-bdd',
      testDir: bdd('desktop'),
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Sefaria's mobile chrome mounts below 843px; tag a scenario @mobile to run it here.
      name: 'chrome-bdd-mobile',
      testDir: bdd('mobile'),
      use: { ...devices['Pixel 5'] },
    },
  ],
});
