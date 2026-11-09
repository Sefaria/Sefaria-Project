import { Page } from '@playwright/test';
import { test, expect, pageFetch } from '../fixtures';
import { t } from '../../globals';
import { closeOwnContexts, openAs, openSettings } from './accountFixtures';

const FLAG_OFF_HOST = 'flagoff.gateway.test';
const ROLE = 'password';

/** Status of a same-origin GET from the page, without following redirects (a redirect reports 'redirect'). */
const statusFromPage = (page: Page, path: string) => page.evaluate(async p => {
  const response = await fetch(p, { credentials: 'same-origin', redirect: 'manual' });
  return response.type === 'opaqueredirect' ? 'redirect' : response.status;
}, path);

const isDeveloperApi = (url: string) => new URL(url).pathname.startsWith('/api/developer');

test.afterEach(async () => { await closeOwnContexts(); });

test.describe('flag off: the old account page, nothing of developer settings', () => {
  test.describe.configure({ timeout: t(180000) });
  test.beforeEach(async ({ target }) => {
    test.skip(!target.hasFlagOffServer, 'The flag-off server exists only on the local stack.');
  });

  test('N-C5: /settings/account has one tab, no agent instructions and no developer API traffic', async ({ account, browser, target }) => {
    const { page } = await openAs(account, browser, target, ROLE, { host: FLAG_OFF_HOST });
    const developerCalls: string[] = [];
    page.on('request', r => { if (isDeveloperApi(r.url())) developerCalls.push(`${r.method()} ${new URL(r.url()).pathname}`); });

    await openSettings(page);
    await expect(page.locator('#accountSettingsPage')).toBeVisible({ timeout: t(30000) });
    await expect(page.locator('#emailNotifications')).toBeVisible();
    expect(await page.evaluate(() => (window as any).Sefaria?._uid)).toBeTruthy();

    await expect(page.locator('[data-agent-action="open-developer-settings"]')).toHaveCount(0);
    const navLinks = await page.locator('nav.settingsNav a').count();
    expect(navLinks, 'at most the Account tab link').toBeLessThanOrEqual(1);
    await expect(page.locator('[data-agent-instructions]')).toHaveCount(0);
    await expect(page.locator('.devPocPageHeader, .devPocOnboarding, .devPocPanel, [role="dialog"]')).toHaveCount(0);

    await page.locator('#accountSettingsPage h1').click();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await page.waitForLoadState('networkidle', { timeout: t(15000) }).catch(() => {});
    expect(developerCalls, 'no /api/developer/* requests').toEqual([]);
  });

  test('N-C5: developer routes are 404, logged in and out, and /api-terms still loads', async ({ account, browser, target }) => {
    const { page } = await openAs(account, browser, target, ROLE, { host: FLAG_OFF_HOST });
    await openSettings(page);
    for (const path of ['/settings/developer', '/settings/developer/projects/1', '/powered-by/form', '/api/developer/state']) {
      expect(await statusFromPage(page, path), `${path} logged in`).toBe(404);
    }

    const anonymous = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const anonPage = await anonymous.newPage();
      const terms = await anonPage.goto('/api-terms', { waitUntil: 'domcontentloaded', timeout: t(60000) });
      expect(terms?.status(), '/api-terms logged out').toBe(200);
      for (const path of ['/settings/developer', '/api/developer/state', '/powered-by/form']) {
        expect(await statusFromPage(anonPage, path), `${path} logged out`).toBe(404);
      }
    } finally {
      await anonymous.close();
    }
  });

  test('N-C5: the Powered by gallery is the same with the flag off', async ({ account, browser, target }) => {
    const on = (await openAs(account, browser, target, ROLE)).page;
    const off = (await openAs(account, browser, target, ROLE, { host: FLAG_OFF_HOST })).page;
    await openSettings(on);
    await openSettings(off);
    const [withFlag, withoutFlag] = await Promise.all([pageFetch(on, '/api/powered-by'), pageFetch(off, '/api/powered-by')]);
    expect(withFlag.status).toBe(200);
    expect(withoutFlag.status).toBe(200);
    expect(withoutFlag.json).toEqual(withFlag.json);
  });
});
