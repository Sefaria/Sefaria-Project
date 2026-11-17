// Staging checks for the API keys phase 1 merge (#3774 to master). The specs are named *.staging.ts, not *.spec.ts,
// so neither the repo's main config nor its api-keys projects ever pick them up; only this config runs them. They read
// public pages, except the account spec, which signs in with the throwaway account made by
// scripts/release/api-keys-phase1/staging-smoke-creds.sh.
//
//   npx playwright test -c e2e-tests/api-keys/staging/playwright.staging.config.ts
//   STAGING_URL=https://www.p1merge.cauldron.sefaria.org STAGING_CREDS_DIR=~/.config/sefaria-apikeys-smoke-p1merge \
//     npx playwright test -c e2e-tests/api-keys/staging/playwright.staging.config.ts      # rehearsal on a cauldron
import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Only staging and dev cauldrons: the account spec puts a session cookie on this host.
const BASE = process.env.STAGING_URL || 'https://www.sefariastaging.org';
const host = new URL(BASE).hostname;
if (
  new URL(BASE).protocol !== 'https:' ||
  !/^(www\.)?(sefariastaging\.org|[a-z0-9-]+\.cauldron\.sefaria\.org)$/.test(host)
) {
  throw new Error(`STAGING_URL ${BASE} is not staging or a dev cauldron; refusing`);
}

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.staging\.ts$/,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  outputDir: path.join(__dirname, '../results/staging'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE,
    locale: 'en-US',
    // Traces record request headers, so they would keep the session cookie outside the credentials directory.
    trace: 'off',
  },
});
