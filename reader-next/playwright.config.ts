import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app (dev server) against recorded API answers: the node server and the browser both reach the API
 * through the cassette proxy (scripts/api-cassette.mjs; E2E_API_MODE auto | replay | record), so live data changes cannot turn the
 * suite red (CODE_REVIEW R-13). E2E_LIVE=1 runs against the live API instead.
 * E2E_PORT moves the main dev server (default 3100). The auth specs use a second dev server (E2E_AUTH_PORT, default 3112) started
 * with test sign-in provider keys, so the Google/Apple buttons and the captcha render; their SDKs are stubbed in the specs.
 */
const PORT = Number(process.env.E2E_PORT) || 3100;
const AUTH_PORT = Number(process.env.E2E_AUTH_PORT) || 3112;
const AUTH_BASE_URL = `http://localhost:${AUTH_PORT}`;
const API_PORT = Number(process.env.E2E_API_PORT) || 3998;
/** Where the app under test reaches the API (server and browser alike). */
const API_ENV: Record<string, string> = process.env.E2E_LIVE ? {} : { PUBLIC_API_ORIGIN: `http://localhost:${API_PORT}` };
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3, // the dev server compiles on demand; too many workers makes first loads flaky
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }, // the header and the strips under it take 180px
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    ...(process.env.E2E_LIVE ? [] : [{ command: "node scripts/api-cassette.mjs", url: `http://localhost:${API_PORT}/__cassette/health`, env: { E2E_API_PORT: String(API_PORT) }, reuseExistingServer: true, timeout: 30_000 }]),
    { command: "npm run dev", url: `http://localhost:${PORT}`, env: { PORT: String(PORT), ...API_ENV }, reuseExistingServer: true, timeout: 60_000 },
    {
      command: "npm run dev",
      url: AUTH_BASE_URL,
      env: { PORT: String(AUTH_PORT), ...API_ENV, GOOGLE_SSO_CLIENT_ID: "test-google-client.apps.googleusercontent.com", APPLE_SSO_CLIENT_ID: "org.example.test", RECAPTCHA_PUBLIC_KEY: "test-recaptcha-key" },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
