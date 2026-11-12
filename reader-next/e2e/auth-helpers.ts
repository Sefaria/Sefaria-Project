import type { Page } from "@playwright/test";

/** The auth dev server (see playwright.config.ts). */
export const AUTH_BASE_URL = `http://localhost:${Number(process.env.E2E_AUTH_PORT) || 3112}`;

/** Public-looking stand-ins: the real client IDs are only used against Django, never in these tests. */
export const TEST_SSO = { googleClientId: "test-google-client.apps.googleusercontent.com", appleClientId: "org.example.test", recaptchaSiteKey: "test-recaptcha-key" };

/** A Google Identity Services stand-in: records calls, "renders" an empty button, and lets a test fire the credential callback. */
const FAKE_GSI = `
window.__gsi = { initialized: [], rendered: 0, prompts: 0 };
window.google = { accounts: { id: {
  initialize(c) { window.__gsi.initialized.push(c); },
  renderButton(el, o) { window.__gsi.rendered++; window.__gsi.lastButton = o; el.innerHTML = '<div style="width:100%;height:100%"></div>'; },
  prompt() { window.__gsi.prompts++; },
} } };
window.dispatchEvent(new Event('google-identity-loaded'));`;
const FAKE_APPLE = `window.__apple = { inits: [] }; window.AppleID = { auth: { init(c) { window.__apple.inits.push(c); }, signIn() { window.__apple.signedIn = true; return new Promise(() => {}); } } };`;
const FAKE_RECAPTCHA = `window.grecaptcha = { render(el, o) { window.__recaptcha = o; el.innerHTML = '<div style="width:304px;height:78px;background:#f9f9f9;border:1px solid #d3d3d3"></div>'; return 0; }, reset() { window.__recaptchaReset = (window.__recaptchaReset||0) + 1; }, ready(cb) { cb(); } };`;

/**
 * The auth specs run against a second dev server started with test provider keys (playwright.config.ts, AUTH_BASE_URL), so the
 * Google/Apple buttons and the captcha render as in production. The three third-party SDKs are replaced by local stand-ins:
 * nothing reaches Google or Apple.
 */
export async function withFakeProviders(page: Page) {
  await page.route("https://accounts.google.com/gsi/client", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_GSI }));
  await page.route("https://appleid.cdn-apple.com/**", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_APPLE }));
  await page.route("https://www.google.com/recaptcha/**", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_RECAPTCHA }));
}

export interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Answer a same-origin auth endpoint with a fixed JSON reply and record what was sent. Never reaches Django. */
export async function mockEndpoint(page: Page, path: string | RegExp, status: number, json: unknown, log: Captured[] = []) {
  const matcher = typeof path === "string" ? (u: URL) => u.pathname === path : (u: URL) => path.test(u.pathname);
  await page.route((u) => matcher(u) && /localhost/.test(u.host), async (route) => {
    const req = route.request();
    if (req.method() !== "POST" && !(req.method() === "GET" && /_allauth|user_stats/.test(req.url()))) return route.fallback();
    log.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() });
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
  });
  return log;
}

/** gtag stand-in that records the sign-up funnel events. */
export async function recordGtag(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __events: unknown[] }).__events = [];
    (window as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...a: unknown[]) => (window as unknown as { __events: unknown[] }).__events.push(a);
  });
}
export const gtagEvents = (page: Page) => page.evaluate(() => (window as unknown as { __events: [string, string, Record<string, unknown>][] }).__events);
