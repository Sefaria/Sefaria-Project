import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app (dev server) against recorded API answers: the node server and the browser both reach the API
 * through the cassette proxy (scripts/api-cassette.mjs; E2E_API_MODE auto | replay | record), so live data changes cannot turn the
 * suite red. E2E_LIVE=1 runs against the live API instead.
 * E2E_PORT moves the main dev server (default 3100). The auth specs use a second dev server (E2E_AUTH_PORT, default 3112) started
 * with test sign-in provider keys, so the Google/Apple buttons and the captcha render; their SDKs are stubbed in the specs. It also
 * reports browser errors (PUBLIC_ERROR_ENDPOINT, as a deployment does) to a path the error-report specs intercept; the main server
 * reports none, so no other spec sends a beacon.
 * A third dev server (E2E_PASS_THROUGH_PORT, default E2E_PORT + 6) runs as in the cluster: pass-through to Django on, same-origin API,
 * and DOMAIN_MODULES for localhost (English) and he.localhost (Hebrew), so e2e/routing-pass-through.spec.ts runs in every suite
 * (E2E_PASS_THROUGH_URL). Its "Django" is the cassette too: Django's pages and the API are recorded answers from www.sefaria.org
 * (the cassette never forwards cookies; replay mode never reaches the network). E2E_LIVE leaves it out.
 */
const PORT = Number(process.env.E2E_PORT) || 3100;
const AUTH_PORT = Number(process.env.E2E_AUTH_PORT) || 3112;
const AUTH_BASE_URL = `http://localhost:${AUTH_PORT}`;
const API_PORT = Number(process.env.E2E_API_PORT) || 3998;
const PASS_THROUGH_PORT = Number(process.env.E2E_PASS_THROUGH_PORT) || PORT + 6;
/** What the error-report specs intercept (e2e/analytics-observability.spec.ts, ERROR_ENDPOINT); never answered by a server. */
const E2E_ERROR_ENDPOINT = "/__e2e/errors";
if (!process.env.E2E_LIVE) process.env.E2E_PASS_THROUGH_URL ??= `http://localhost:${PASS_THROUGH_PORT}`;
const DOMAIN_MODULES = JSON.stringify({
  en: { library: `http://localhost:${PASS_THROUGH_PORT}`, voices: `http://voices.localhost:${PASS_THROUGH_PORT}` },
  he: { library: `http://he.localhost:${PASS_THROUGH_PORT}`, voices: `http://chiburim.localhost:${PASS_THROUGH_PORT}` },
});
/** Where the app under test reaches the API (server and browser alike). */
const API_ENV: Record<string, string> = {
  ...(process.env.E2E_LIVE ? {} : { PUBLIC_API_ORIGIN: `http://localhost:${API_PORT}` }),
  // the labs the e2e specs cover (src/lib/labs.ts), on by default here; remote config could still turn them off
  PUBLIC_LABS: "follow_me,recording",
};
export default defineConfig({
  testDir: "e2e",
  // replay: a request with no recording fails the run (the setup returns that check as the run's teardown)
  globalSetup: "./e2e/cassette-misses.ts",
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
      env: {
        PORT: String(AUTH_PORT),
        ...API_ENV,
        GOOGLE_SSO_CLIENT_ID: "test-google-client.apps.googleusercontent.com",
        APPLE_SSO_CLIENT_ID: "org.example.test",
        RECAPTCHA_PUBLIC_KEY: "test-recaptcha-key",
        PUBLIC_ERROR_ENDPOINT: E2E_ERROR_ENDPOINT,
      },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    ...(process.env.E2E_LIVE
      ? []
      : [
          {
            command: "npm run dev",
            url: `http://localhost:${PASS_THROUGH_PORT}/texts`,
            env: {
              PORT: String(PASS_THROUGH_PORT),
              PUBLIC_LABS: API_ENV.PUBLIC_LABS!,
              SEFARIA_PASS_THROUGH: "1",
              SEFARIA_API_ORIGIN: `http://localhost:${API_PORT}`,
              PUBLIC_API_ORIGIN: "",
              PUBLIC_SITE_ORIGIN: "",
              DOMAIN_MODULES,
            },
            // never someone else's server on that port (another worktree's run): it must be this one, with this env
            reuseExistingServer: false,
            timeout: 60_000,
          },
        ]),
  ],
});
