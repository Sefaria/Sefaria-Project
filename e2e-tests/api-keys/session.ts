import fs from 'fs';
import { Browser, BrowserContext, Page, expect } from '@playwright/test';
import { t } from '../globals';
import { AUTH_STATUS_FILE, authFile, baseURLFor, loadManifest, TargetName } from './env';

/**
 * Logging in seeded accounts and opening contexts as them.
 *
 * The session cookie is host-only (SESSION_COOKIE_DOMAIN is None locally), so a storage state
 * captured on www.gateway.test does not reach direct.gateway.test or flagoff.gateway.test.
 * contextAs() copies the cookies onto another host when asked; both hosts share one database.
 */

export type InterfaceLang = 'english' | 'hebrew';

/**
 * Cookies and init scripts that keep first-visit overlays and the language redirect out of the way.
 * `stubStrapi: false` skips the Strapi route: while any route is active, Playwright answers CORS
 * preflights itself, so tests that depend on real cross-origin behaviour must not install one.
 */
export async function prepareContext(
  context: BrowserContext,
  baseURL: string,
  lang: InterfaceLang = 'english',
  { stubStrapi = true }: { stubStrapi?: boolean } = {},
) {
  await context.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && (key.startsWith('modal_') || key.startsWith('banner_'))) return 'true';
      return original.call(this, key);
    };
  });
  await context.addCookies([
    { name: 'cookiesNotificationAccepted', value: '1', url: baseURL },
    { name: 'interfaceLang', value: lang, url: baseURL },
  ]);
  if (!stubStrapi) return;
  await context.route('**/api/strapi/graphql-cache*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { modals: { data: [] }, banners: { data: [] }, sidebarAds: { data: [] } } }),
  }));
}

/**
 * Logs in through the real form and proves it worked: the browser stays on the target origin and
 * the server renders Sefaria._uid equal to the seeded id.
 */
export async function logIn(page: Page, baseURL: string, email: string, password: string, expectedUid: number) {
  const expectedOrigin = new URL(baseURL).origin;
  const foreign = new Set<string>();
  const watch = (frame: any) => {
    if (frame.parentFrame()) return;
    try {
      const origin = new URL(frame.url()).origin;
      if (origin !== expectedOrigin && origin !== 'null') foreign.add(origin);
    } catch { /* about:blank */ }
  };
  page.on('framenavigated', watch);

  await page.goto(`${baseURL}/login?next=%2Fsettings%2Faccount`, { waitUntil: 'domcontentloaded', timeout: t(60000) });
  const continueWithEmail = page.getByRole('button', { name: /Continue with Email|המשך עם דוא״ל/ }).first();
  const emailField = page.locator('input[name="email"]').first();
  try {
    await expect(continueWithEmail.or(emailField)).toBeVisible({ timeout: t(30000) });
  } catch {
    throw new Error(`The login form did not render within 30 s at ${page.url()} (server slow, restarting, or an error page).`);
  }
  if (await continueWithEmail.isVisible()) await continueWithEmail.click();
  await emailField.fill(email);
  await page.locator('input[name="password"]').first().fill(password);
  await page.locator('input[name="password"]').first().press('Enter');
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: t(30000), waitUntil: 'commit' });
  page.off('framenavigated', watch);

  if (foreign.size) {
    throw new Error(`Login for ${email} passed through ${[...foreign].join(', ')}; the session cookie is stranded there.`);
  }
  if (new URL(page.url()).origin !== expectedOrigin) {
    throw new Error(`Login for ${email} left ${expectedOrigin} and landed on ${new URL(page.url()).origin}.`);
  }
  await page.waitForFunction(() => (window as any).Sefaria?._uid !== undefined, null, { timeout: t(30000) });
  const uid = await page.evaluate(() => (window as any).Sefaria?._uid);
  if (Number(uid) !== expectedUid) {
    throw new Error(`Login for ${email} is not authenticated as ${expectedUid}: Sefaria._uid is ${JSON.stringify(uid)}.`);
  }
}

export type AuthStatus = { runId: string; accounts: Record<string, { ok: boolean; reason?: string; at: string }> };

export function readAuthStatus(): AuthStatus | undefined {
  try {
    return JSON.parse(fs.readFileSync(AUTH_STATUS_FILE, 'utf-8'));
  } catch {
    return undefined;
  }
}

/** Path of a logged-in storage state, or a clear error naming why the setup could not make it. */
export function storageStateFor(suite: string, role: string): string {
  const file = authFile(suite, role);
  const recorded = readAuthStatus();
  const runId = loadManifest().runId;
  if (recorded && recorded.runId !== runId) {
    throw new Error(
      `Sessions were captured for seed run ${recorded.runId}, but the manifest is now ${runId}: the fixtures were ` +
      `re-seeded after apikeys-setup ran, which recreates the accounts and ends their sessions. Rerun the setup.`
    );
  }
  if (fs.existsSync(file)) return file;
  const status = recorded?.accounts[`${suite}.${role}`];
  throw new Error(
    status && !status.ok
      ? `No session for ${suite}.${role}: login failed in apikeys-setup (${status.reason}).`
      : `No session for ${suite}.${role}. Run with --project=apikeys so apikeys-setup logs it in first.`
  );
}

/**
 * A new context logged in as a seeded account. `host` moves the session cookies to another
 * *.gateway.test host on the local stack (for example `flagoff.gateway.test`).
 */
export async function contextAs(
  browser: Browser,
  target: TargetName,
  suite: string,
  role: string,
  { host, lang = 'english', options = {}, stubStrapi = true }: {
    host?: string; lang?: InterfaceLang; options?: Parameters<Browser['newContext']>[0]; stubStrapi?: boolean;
  } = {},
): Promise<BrowserContext> {
  const state = JSON.parse(fs.readFileSync(storageStateFor(suite, role), 'utf-8'));
  if (host) {
    if (target !== 'local' || !/\.gateway\.test$|^gateway\.test$/.test(host)) {
      throw new Error(`Moving a session to ${host} is only supported between *.gateway.test hosts on the local stack.`);
    }
    state.cookies = state.cookies.map((c: any) => ({ ...c, domain: host }));
  }
  const baseURL = host ? baseURLFor(target).replace(/www\.gateway\.test/, host) : baseURLFor(target);
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: target === 'cauldron',
    locale: lang === 'hebrew' ? 'he-IL' : 'en-US',
    ...options,
    storageState: state,
  });
  await prepareContext(context, baseURL, lang, { stubStrapi });
  return context;
}
