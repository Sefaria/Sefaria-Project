/**
 * Throwaway users for e2e tests — a TEMPORARY STOPGAP, and the ONLY place that creates them.
 *
 * A fresh user per test is required wherever a test makes permanent changes: donor status
 * never goes back, so a shared account marked a donor would break every non-donor test after it.
 *
 * HOW: POST /api/register/ (the mobile-app registration API). It runs the same
 * process_register_form as the web form but skips ReCaptcha (which needs real keys in CI),
 * gated instead by MOBILE_APP_KEY. Then a normal login through the same LoginPage flow
 * global-setup uses, so the browser context gets a real Django session.
 *
 * SAFETY:
 *   - Host allowlist: registration calls the CRM. It is NONE locally and in integration, but
 *     SALESFORCE on preprod — pointing this at preprod would create real Salesforce records.
 *   - A reserved .test address (cannot receive mail) with a sweepable prefix.
 *   - No teardown yet: account deletion emails hello@sefaria.org and flags CRM review on every
 *     call. The throwaway-user follow-up PR adds key-gated signup, teardown and a sweep; only
 *     this file should need to change then.
 *
 * Integration data is shared and persistent: Mongo profiles vanish in the nightly restore,
 * Postgres auth_user rows accumulate (roughly one per merge-queue run).
 */

import { LoginPage } from '../pages/loginPage';
import { LANGUAGES, t } from '../globals';

const ALLOWED_HOST_PATTERNS = [
  /^localhost$/,
  /^127\.0\.0\.1$/,
  /\.integration\.sefaria\.org$/,
  // The host CI's integration-testing.yaml points SANDBOX_URL at: nginx-integration-<commit>.<namespace>
  // (an in-cluster service name, so the "TLD" is the namespace). Anchored at both ends so
  // nothing like preprod can match it.
  /^nginx-integration-[0-9a-f]{7,40}\.[a-z0-9-]+$/,
];

export const THROWAWAY_EMAIL_DOMAIN = 'sefaria-e2e.test';

/** Why throwaway registration cannot run in this environment, or null when it can. For test.skip. */
export function throwawayUserPrerequisitesMissing() {
  return process.env.MOBILE_APP_KEY ? null : 'MOBILE_APP_KEY is not set for the Playwright run';
}

/**
 * Register a brand-new user and log the page's context in as them.
 *
 * @param page     the test's page; its context receives the session cookie
 * @param request  the test's standalone `request` fixture (its own cookie jar, separate from page)
 * @param baseURL  the run's base URL (the `baseURL` fixture)
 * @param purpose  short slug naming the test, embedded in the address for later sweeping
 * @returns {{ email: string, password: string }}
 */
export async function registerThrowawayUser(page, request, baseURL, { purpose }) {
  if (!baseURL) {
    // Without this, `new URL(undefined)` throws an unhelpful "Invalid URL" below.
    throw new Error('registerThrowawayUser needs a baseURL; is SANDBOX_URL set for the Playwright run?');
  }
  // CI sets SANDBOX_URL to ".../texts" (a page, not a site root). Plain string concatenation
  // would build ".../texts/api/register/", so every URL below is resolved against the base
  // instead: a leading "/" replaces the whole path.
  const urlOnSandbox = (pathname) => new URL(pathname, baseURL).href;
  const host = new URL(baseURL).hostname;
  if (!ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error(`registerThrowawayUser refuses to run against ${host}: only localhost, *.integration.sefaria.org and CI's nginx-integration-<commit>.<namespace> are allowed.`);
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright+${purpose}-${unique}@${THROWAWAY_EMAIL_DOMAIN}`;
  const password = `Pw-${unique}-e2e!`;

  // The standalone request fixture, NOT page.context().request (which shares the page's
  // cookies): registration must not depend on, or alter, the browser session. The view reads
  // request.POST, so this is form-encoded, not JSON.
  const response = await request.post(urlOnSandbox('/api/register/'), {
    form: {
      email,
      first_name: 'Playwright',
      last_name: purpose,
      password1: password,
      // The API form still requires the confirmation field: SefariaNewUserFormAPI.__init__
      // calls super(SefariaNewUserForm, self), which skips the __init__ that drops password2 for
      // the website signup form. Without it registration answers 200 with a form error.
      password2: password,
      mobile_app_key: process.env.MOBILE_APP_KEY,
    },
  });
  // register_api answers 200 for failures too, with the form errors as the body; success is
  // the JWT pair. Read as text first so a non-JSON failure (an HTML 500 page) reports what it
  // actually said instead of a JSON parse error.
  const bodyText = await response.text();
  let body = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // leave body null; reported below
  }
  if (!response.ok() || !body?.access) {
    throw new Error(`Throwaway registration failed (${response.status()}): ${bodyText.slice(0, 500)}`);
  }

  // global-setup pre-seeds this cookie for the same reason: without it Sefaria can geo-redirect
  // /login to the Hebrew-interface domain and the English-label selectors in LoginPage miss.
  await page.context().addCookies([{ name: 'interfaceLang', value: LANGUAGES.EN, url: urlOnSandbox('/') }]);

  await page.goto(urlOnSandbox('/login'), { waitUntil: 'domcontentloaded' });
  await new LoginPage(page, LANGUAGES.EN).loginAs({ email, password });
  // Authenticated-state oracle, the same one global-setup uses: the profile pic only renders for
  // a logged-in user, so a timeout here means the login failed.
  await page
    .locator('.profile-pic, .accountBox, img.profile-pic-image')
    .first()
    .waitFor({ state: 'visible', timeout: t(30000) });

  return { email, password };
}
