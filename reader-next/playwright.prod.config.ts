import { defineConfig, devices } from "@playwright/test";

/**
 * The stylesheet guard (e2e/ssr-styles.spec.ts) against the PRODUCTION build: in dev, Start's dev styles inline every module's CSS,
 * so the check passes whatever the build does. Run after `npm run build`:
 *   npm run test:e2e:prod
 * The built server (server/index.mjs) reaches the API through the same cassette as the dev suite (scripts/api-cassette.mjs).
 * E2E_PORT (default 3150) and E2E_API_PORT (default 3998) as in playwright.config.ts.
 */
const PORT = Number(process.env.E2E_PORT) || 3150;
const API_PORT = Number(process.env.E2E_API_PORT) || 3998;

export default defineConfig({
  testDir: "e2e",
  // replay: a request with no recording fails the run (the setup returns that check as the run's teardown)
  globalSetup: "./e2e/cassette-misses.ts",
  testMatch: ["ssr-styles.spec.ts"],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: [
    { command: "node scripts/api-cassette.mjs", url: `http://localhost:${API_PORT}/__cassette/health`, env: { E2E_API_PORT: String(API_PORT) }, reuseExistingServer: true, timeout: 30_000 },
    { command: "node server/index.mjs", url: `http://localhost:${PORT}/healthz-reader`, env: { PORT: String(PORT), PUBLIC_API_ORIGIN: `http://localhost:${API_PORT}` }, reuseExistingServer: false, timeout: 60_000 },
  ],
});
