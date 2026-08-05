import fs from 'fs';
import path from 'path';
import { BrowserContext, Page, expect } from '@playwright/test';
import { t } from '../globals';

/**
 * Shared plumbing for the Library Assistant opt-out suite.
 *
 * Deliberately independent of `e2e-tests/utils.ts` and `constants.ts`: those derive
 * `MODULE_URLS` and cookie domains from `SANDBOX_URL` and assume a two-domain, two-module
 * sandbox with `www.` and `voices.` subdomains. This suite has to run against a bare
 * `http://localhost:8000` as well, where none of that holds — `.localhost:8000` is not a
 * legal cookie domain — so it carries its own small entry point instead.
 */

// Every URL in this suite is built by concatenating a path onto this, so a trailing slash
// would produce `https://host//Genesis.1` and fail as if the product were broken.
export const BASE_URL = (process.env.LA_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

/**
 * Which side of the Phase 2 migration the environment under test is on.
 *
 *   `pre`  — Phase 1 deployed, migration not yet run. Profiles with no setting key fall
 *            back to the experiments rule, so a never-enrolled user has no assistant.
 *   `post` — the migration has run. Every profile carries the key, so the never-enrolled
 *            user is on. Phase 3 removes the fallback but changes no expectation here,
 *            because after the migration nothing reads it — which is exactly what makes
 *            one suite serve all three phases.
 */
export type Phase = 'pre' | 'post';
export const PHASE: Phase = (process.env.LA_PHASE as Phase) || 'pre';

export type Account = {
  key: string;
  id: number;
  email: string;
  password: string;
  expected_pre: boolean;
  expected_post: boolean;
  /** Written to by the mutation tests, so excluded from the read-only cohort matrix. */
  scratch: boolean;
  why: string;
};

const MANIFEST = path.join(__dirname, '..', '.la-e2e-users.json');

export function accounts(): Account[] {
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(
      `No seeded-account manifest at ${MANIFEST}.\n` +
      `Run: python scripts/dev/seed_library_assistant_e2e_users.py --reset`
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')).accounts;
}

/**
 * The read-only cohorts. Excludes the scratch account the mutation tests write to: if that
 * one is left in an unexpected state by a failing test, the failure should stay in that
 * test rather than reappearing as an unrelated cohort assertion on the next run.
 */
export function cohorts(): Account[] {
  return accounts().filter(a => !a.scratch);
}

export function account(key: string): Account {
  const found = accounts().find(a => a.key === key);
  if (!found) throw new Error(`No seeded account "${key}". Re-run the seeding script.`);
  return found;
}

/** What the assistant should do for this account in the environment under test. */
export function expected(a: Account): boolean {
  return PHASE === 'pre' ? a.expected_pre : a.expected_post;
}

export const authFile = (key: string) => path.join(__dirname, '.auth', `${key}.json`);

/** Keep first-visit overlays from covering the page. Cookie domain is host-only, so this
 *  works on localhost, a cauldron, and staging alike. */
export async function suppressOverlays(context: BrowserContext) {
  await context.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && (key.startsWith('modal_') || key.startsWith('banner_'))) {
        return 'true';
      }
      return original.call(this, key);
    };
  });
  await context.addCookies([{
    name: 'cookiesNotificationAccepted',
    value: '1',
    url: BASE_URL,
  }]);
  await context.route('**/api/strapi/graphql-cache*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { modals: { data: [] }, banners: { data: [] }, sidebarAds: { data: [] } } }),
  }));
}

/** Log in through the real form. Used by the setup project, once per account. */
export async function logIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').first().fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  await page.locator('input[name="password"]').first().press('Enter');
  // `commit` resolves as soon as the post-login navigation is committed. The default
  // (`load`) waits for every subresource — fonts, analytics, the chatbot bundle — which a
  // remote host serves and a bare localhost does not, so it turns a successful login into
  // a timeout against staging.
  await page.waitForURL(url => !url.pathname.startsWith('/login'), {
    timeout: t(30000),
    waitUntil: 'commit',
  });
}

/**
 * Whether the assistant is switched on for the current session, read from the props the
 * server sent. This is the server's answer — the one the helper module computes — and it
 * is the same field in every phase.
 */
export async function assistantEnabledInProps(page: Page): Promise<boolean> {
  return page.evaluate(() => !!(window as any).Sefaria?.chatbot_enabled);
}

/**
 * Whether the assistant actually mounted. `ReaderApp` renders `<lc-chatbot>` only when the
 * server said enabled AND issued a user token; the element exists whether or not the
 * external bundle that upgrades it is reachable, so this is a fair check locally.
 */
export function assistantElement(page: Page) {
  return page.locator('lc-chatbot');
}

/**
 * The `<script>` tag that turns `<lc-chatbot>` into a working component.
 *
 * `templates/base.html` emits it from `chatbot_script_url`, which a *second*, independent
 * enablement check in `sefaria/system/context_processors.py` decides. Three URL shapes are
 * possible: a local Vite dev server (`http://localhost:5173/src/main.js`), the deployed
 * bundle (`<chatbot base>/static/js/lc-chatbot.umd.cjs`), and a per-version build on
 * coolifydev (same filename, plus a cache-busting query). This matches all three.
 */
export function chatbotScriptTag(page: Page) {
  return page.locator('script[src*="lc-chatbot"], script[src*=":5173/src/main.js"]');
}

/**
 * Assert every half of the gate: what the server told React, what React mounted, and
 * whether the server also emitted the bundle that upgrades the element.
 *
 * The script tag is worth asserting separately because it is decided by its own call to
 * the enablement helper. Without it `<lc-chatbot>` is an inert, un-upgraded custom element
 * — present in the DOM, useless to the user — so a suite that checked only the prop and
 * the element would stay green through a total failure of the server-side gate.
 */
export async function expectAssistant(page: Page, on: boolean, because: string) {
  const inProps = await assistantEnabledInProps(page);
  expect(inProps, `chatbot_enabled should be ${on} — ${because}`).toBe(on);

  const gateMismatch =
    `If this disagrees with the chatbot_enabled assertion above, the two enablement ` +
    `checks have diverged: the React prop comes from reader/views.py and the script tag ` +
    `from sefaria/system/context_processors.py, and both must reach the same answer. ` +
    `Prop right + tag wrong leaves an un-upgraded <lc-chatbot> that never becomes a ` +
    `chatbot; tag right + prop wrong ships the bundle to a user who should not have it.`;

  if (on) {
    await expect(assistantElement(page), `<lc-chatbot> should render — ${because}`)
      .toBeAttached({ timeout: t(20000) });
    // Not an exact count: the bundle itself may append further scripts once it runs.
    await expect(chatbotScriptTag(page), `the chatbot script tag should be present — ${because}. ${gateMismatch}`)
      .not.toHaveCount(0, { timeout: t(20000) });
  } else {
    await expect(assistantElement(page), `<lc-chatbot> should not render — ${because}`)
      .toHaveCount(0, { timeout: t(20000) });
    await expect(chatbotScriptTag(page), `the chatbot script tag should be absent — ${because}. ${gateMismatch}`)
      .toHaveCount(0, { timeout: t(20000) });
  }
}

/**
 * A reader page is where the assistant lives; wait for React to have hydrated.
 *
 * Retries once on ERR_ABORTED. The settings page reloads itself after a save that changed
 * the assistant, and an abort means precisely that another navigation won the race — the
 * page is fine, this navigation just needs reissuing.
 */
export async function goToReader(page: Page, ref = '/Genesis.1') {
  const url = `${BASE_URL}${ref}`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } catch (e: any) {
    if (!String(e?.message).includes('ERR_ABORTED')) throw e;
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForFunction(() => !!(window as any).Sefaria, null, { timeout: t(45000) });
  await expect(page.locator('.readerApp')).toBeAttached({ timeout: t(45000) });
}

export const SETTINGS_URL = '/settings/account';

export async function goToAccountSettings(page: Page) {
  await page.goto(`${BASE_URL}${SETTINGS_URL}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#libraryAssistantSetting')).toBeVisible({ timeout: t(20000) });
  // The promo banner mounts on this page too and can sit over the save controls, so a
  // click on Save fails with "intercepts pointer events" rather than anything to do with
  // the setting. Hide it rather than dismissing it — dismissal writes a cookie, and
  // whether the banner should be here at all is LAS-060's assertion to make, not a side
  // effect of some other test's navigation.
  await page.addStyleTag({ content: '.siteWideBannerContent { display: none !important; }' })
    .catch(() => {});
}

/** The toggle renders the *effective* value, so this is what the user is told. */
export async function toggleShowsOn(page: Page): Promise<boolean> {
  const on = page.locator('#libraryAssistantSetting .toggleOption[data-value=true]');
  return (await on.getAttribute('aria-checked')) === 'true';
}

export async function setToggle(page: Page, on: boolean) {
  await page.locator(`#libraryAssistantSetting .toggleOption[data-value=${on}]`).click();
}

/**
 * Click Save and hand back the settings object the page actually posted.
 *
 * The decision of *whether* to send `library_assistant` lives in jQuery in
 * `templates/account_settings.html` and is invisible to the Python tests, so the request
 * body is the only place it can be observed. Fulfilling the route rather than letting it
 * through keeps a test that only cares about the payload from mutating the account.
 */
export async function saveSettingsAndCapturePayload(
  page: Page,
  { persist = true }: { persist?: boolean } = {},
): Promise<any> {
  let posted: any = null;
  await page.route('**/api/profile', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postData() || '';
    const json = new URLSearchParams(body).get('json');
    posted = JSON.parse(json || '{}');
    if (persist) return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // The page reloads itself when the assistant toggle changed, because the script tag and
  // the user token are both decided server-side. Arm the listener before the click: if the
  // caller navigates while that reload is in flight, the navigation aborts.
  const reloaded = page.waitForEvent('load', { timeout: t(20000) }).catch(() => null);

  await page.locator('.saveAccountSettingsBtn').first().click();
  await expect.poll(() => posted, { timeout: t(20000) }).not.toBeNull();
  await page.unroute('**/api/profile');

  if (persist && posted?.settings?.library_assistant !== undefined) {
    await reloaded;
    await expect(page.locator('#libraryAssistantSetting')).toBeVisible({ timeout: t(20000) });
  }
  return posted;
}

/**
 * Register a brand-new account.
 *
 * Goes through `/api/register/` rather than the HTML form: the form carries a reCAPTCHA
 * that cannot be driven headlessly wherever real keys are configured. The API form drops
 * the captcha and requires `mobile_app_key` instead — the dev default is the literal
 * "MOBILE_APP_KEY" (see `sefaria/local_settings_example.py`); against staging, export the
 * real one as LA_MOBILE_APP_KEY.
 *
 * Both paths run the same `process_register_form`, which is where the setting is written,
 * so this exercises the real code path a person registering on the site would.
 */
export const MOBILE_APP_KEY = process.env.LA_MOBILE_APP_KEY || 'MOBILE_APP_KEY';

export async function registerViaApi(page: Page, email: string, password: string) {
  let text = '';
  let status = 0;

  // Registration is one long `transaction.atomic()`. Against the default local sqlite that
  // collides with any concurrent write and returns a 500 "database is locked" — an
  // artifact of the dev database, not of the code under test, and absent on Postgres.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.post(`${BASE_URL}/api/register/`, {
      form: {
        email,
        first_name: 'LA',
        last_name: 'Newcomer',
        password1: password,
        password2: password,
        mobile_app_key: MOBILE_APP_KEY,
      },
    });
    status = response.status();
    text = await response.text();
    try {
      const body = JSON.parse(text);
      if (response.ok() && 'access' in body) return body;
      // Field errors are deterministic — retrying cannot help.
      if (response.ok()) break;
    } catch { /* not JSON: a 500 error page */ }
    if (status !== 500) break;
    await page.waitForTimeout(t(2000 * (attempt + 1)));
  }

  throw new Error(
    `/api/register/ did not create an account (HTTP ${status}): ${text.slice(0, 400)}\n` +
    `If this says "Incorrect mobile_app_key", set LA_MOBILE_APP_KEY to the target ` +
    `environment's MOBILE_APP_KEY secret.`
  );
}
