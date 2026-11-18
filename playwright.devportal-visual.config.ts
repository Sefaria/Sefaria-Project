/**
 * Developer portal visual parity (docs/dev-portal/PLAN.md §6.1).
 *
 * A separate config on purpose: the default `npx playwright test` (the merge-queue run) and the
 * BDD run never pick up visual tests. Run it explicitly:
 *
 *   npx playwright test --config=playwright.devportal-visual.config.ts
 *   npx playwright test --config=playwright.devportal-visual.config.ts --project=visual-1440
 *
 * The suite itself lives in e2e-tests/developers-visual/ (states, adapters, deviations,
 * baselines). Baselines are live ReadMe captured with Roboto and Heebo injected, so they are
 * only comparable in the environment recorded in baselines/ENV.json (§6.1.1).
 */
import { defineConfig, devices } from '@playwright/test';
import { t } from './e2e-tests/globals';

// Same env handling as playwright.config.ts: outside CI, e2e-tests/.env is loaded.
if (!process.env.CI) {
  const env = require('dotenv').config({ path: './e2e-tests/.env' }).parsed;
  process.env = { ...process.env, ...env };
}

// The local side of the comparison: the portal under test. Same resolution as
// e2e-tests/constants.ts (MODULE_URLS.EN.DEVELOPERS): E2E_DEVELOPERS_URL; for a local
// SANDBOX_URL, its developers. sub-host (127.0.0.1 becomes localhost); otherwise
// https://developers.<SANDBOX_DOMAIN>. The live side always uses absolute
// https://developers.sefaria.org URLs from the live adapter.
const SANDBOX_DOMAIN = process.env.SANDBOX_URL?.replace(/^https?:\/\//, '').replace(/^www\./, '');
const IS_LOCAL_SANDBOX = /^(https?:\/\/)?(localhost|127\.0\.0\.1)/.test(process.env.SANDBOX_URL ?? '');
const localDevelopersBase = (raw: string) => {
  const local = raw.replace('127.0.0.1', 'localhost');
  const u = new URL(/^https?:\/\//.test(local) ? local : `http://${local}`);
  return `${u.protocol}//developers.${u.host}`;
};
const DEVELOPERS_URL =
  process.env.E2E_DEVELOPERS_URL ??
  (IS_LOCAL_SANDBOX ? localDevelopersBase(process.env.SANDBOX_URL!) : `https://developers.${SANDBOX_DOMAIN}`);

// The five widths of Appendix B. Desktop Chrome's other settings (user agent, no touch) are
// kept; viewport and scale are fixed so the screenshots are byte-comparable.
const WIDTHS = [
  { name: 'visual-1440', viewport: { width: 1440, height: 900 } },
  { name: 'visual-1280', viewport: { width: 1280, height: 800 } },
  { name: 'visual-1024', viewport: { width: 1024, height: 768 } },
  { name: 'visual-768', viewport: { width: 768, height: 1024 } },
  { name: 'visual-390', viewport: { width: 390, height: 844 } },
] as const;

export default defineConfig({
  testDir: './e2e-tests/developers-visual',
  outputDir: './e2e-tests/e2e-test-logs/devportal-visual-results',
  // §6.1.1: every comparison target is a committed PNG under baselines/roboto/.
  snapshotPathTemplate: './e2e-tests/developers-visual/baselines/roboto/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: t(60000),
  // A visual difference is a finding, not a flake: no retries.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  expect: {
    timeout: t(10000),
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // §6.1.4 gate 3: per-pixel colour threshold 0.2; at most 0.5% of a viewport's pixels
      // may differ. Region comparisons pass their own limit (1.0%) at the call site.
      threshold: 0.2,
      maxDiffPixelRatio: 0.005,
    },
  },
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report-devportal-visual', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: DEVELOPERS_URL,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    colorScheme: 'light',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: WIDTHS.map(({ name, viewport }) => ({
    name,
    use: {
      ...devices['Desktop Chrome'],
      viewport,
      deviceScaleFactor: 1,
    },
  })),
});
