import { defineConfig, devices } from "@playwright/test";

/** End-to-end tests run the real app (dev server) against the live Sefaria API. */
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3, // the dev server compiles on demand; too many workers makes first loads flaky
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }, // the header and the strips under it take 180px
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: { command: "npm run dev", url: "http://localhost:3100", reuseExistingServer: true, timeout: 60_000 },
});
