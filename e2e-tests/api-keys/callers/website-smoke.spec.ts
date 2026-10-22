import { BrowserContext, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { baseURLFor } from '../env';
import { InterfaceLang, contextAs, prepareContext } from '../session';
import { t } from '../../globals';
import { rawRequest, stamped, summary } from '../gateway/util';
import { voicesBase, watchRefusals } from './browser';

/**
 * The website's own traffic through the gateway: page views, XHRs and static files must never be
 * refused, in either interface language, logged in or out.
 */

const LIBRARY_PAGES = ['/texts', '/Genesis.1', '/search?q=light&tab=text', '/topics'];
const SETTINGS_PAGES = ['/settings/account', '/settings/developer'];

async function anonymousContext(browser: any, target: 'local' | 'cauldron', lang: InterfaceLang): Promise<BrowserContext> {
  const baseURL = baseURLFor(target);
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: target === 'cauldron', locale: lang === 'hebrew' ? 'he-IL' : 'en-US' });
  await prepareContext(context, baseURL, lang, { stubStrapi: false });
  await prepareContext(context, voicesBase(target), lang, { stubStrapi: false });
  return context;
}

async function visit(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: t(60000) });
  expect(response, `${url}: no response`).not.toBeNull();
  expect(response!.status(), `${url}: document status`).toBeLessThan(400);
  await page.waitForFunction(() => (window as any).Sefaria !== undefined, null, { timeout: t(30000) });
  await page.waitForLoadState('networkidle', { timeout: t(5000) }).catch(() => { /* long-polling pages never go idle */ });
}

test.describe('website through the gateway', () => {
  test.describe.configure({ timeout: t(300000) });
  for (const lang of ['english', 'hebrew'] as InterfaceLang[]) {
    test(`B1: logged out, ${lang}: library, reader, search, topics and voices get no 401 or 403`, async ({ browser, target }) => {
      const context = await anonymousContext(browser, target.name, lang);
      const page = await context.newPage();
      const refusals = watchRefusals(page, target.name);
      try {
        for (const path of LIBRARY_PAGES) await visit(page, path);
        await visit(page, `${voicesBase(target.name)}/`);
      } finally {
        await context.close();
      }
      expect(refusals, JSON.stringify(refusals)).toEqual([]);
    });

    test(`B1: logged in, ${lang}: library, reader, search, settings and voices get no 401 or 403`, async ({ account, target }) => {
      const { page, account: who } = await account('callers', 'eval', { lang, stubStrapi: false });
      const refusals = watchRefusals(page, target.name);
      for (const path of [...LIBRARY_PAGES, ...SETTINGS_PAGES]) await visit(page, path);
      expect(await page.evaluate(() => (window as any).Sefaria._uid)).toBe(who.id);
      await visit(page, `${voicesBase(target.name)}/`);
      expect(refusals, JSON.stringify(refusals)).toEqual([]);
    });
  }

  test('N-A9: first-party traffic is split across tiers by method: same-origin GET anonymous, POST and cross-module embed', async ({ browser, target }) => {
    test.skip(!target.hasEcho, 'needs the echo upstream to read the tier the gateway stamps');
    const context = await anonymousContext(browser, target.name, 'english');
    const page = await context.newPage();
    await visit(page, '/texts');

    const sent: Record<string, Record<string, string>> = {};
    page.on('request', async request => {
      const url = request.url();
      if (url.includes('/api/') && url.includes('na9=')) sent[new URL(url).searchParams.get('na9')!] = await request.allHeaders();
    });
    const voices = voicesBase(target.name);
    await page.evaluate(async voices => {
      await fetch('/api/v3/texts/Genesis.1.1?na9=get').catch(() => {});
      await fetch('/api/profile/sync?na9=post', { method: 'POST', body: '' }).catch(() => {});
      await fetch(`${voices}/api/v3/texts/Genesis.1.1?na9=cross`).catch(() => {});
    }, voices);
    await expect.poll(() => Object.keys(sent).sort()).toEqual(['cross', 'get', 'post']);
    await context.close();

    const tiers: Record<string, { tier?: string; result?: string }> = {};
    for (const [label, headers] of Object.entries(sent)) {
      const forwarded: Record<string, string> = {};
      for (const name of ['origin', 'authorization', 'x-api-key']) if (headers[name] !== undefined) forwarded[name] = headers[name];
      const echoed = await rawRequest({ target: target.name, host: 'echo', path: '/api/v3/texts/Genesis.1.1', method: label === 'post' ? 'POST' : 'GET', headers: forwarded, body: label === 'post' ? '' : undefined });
      expect(echoed.status, summary(echoed)).toBe(200);
      const { tier, result } = stamped(echoed);
      tiers[label] = { tier, result };
    }
    test.info().annotations.push({ type: 'evidence', description: `first-party tiers: ${JSON.stringify(tiers)}` });
    expect(tiers).toEqual({
      get: { tier: 'anonymous', result: 'anonymous' },
      post: { tier: 'embed', result: 'embed' },
      cross: { tier: 'embed', result: 'embed' },
    });
  });

  test('N-M4: /settings/account renders on the server, with and without a trailing slash; Voices has no account page', async ({ browser, target }) => {
    const health = await rawRequest({ target: target.name, path: '/healthz' });
    const ssr = health.json?.nodejsReady === true;
    const context = await contextAs(browser, target.name, 'callers', 'eval', { options: { javaScriptEnabled: false } });
    const page = await context.newPage();
    try {
      for (const path of ['/settings/account', '/settings/account/']) {
        const response = await page.goto(path, { timeout: t(60000) });
        expect(response!.status(), path).toBe(200);
        expect(new URL(page.url()).pathname, `${path} stayed on the settings page`).toMatch(/^\/settings\/account\/?$/);
        const html = await page.content();
        if (ssr) {
          expect(html, `${path}: server-rendered account settings`).toContain('id="accountSettingsPage"');
          expect(html, `${path}: SSR fell back to the loading placeholder`).not.toContain('id="appLoading"');
        } else {
          test.info().annotations.push({ type: 'skip-part', description: `no Node SSR on ${target.name} (/healthz nodejsReady=false); content check not run for ${path}` });
        }
      }
      const voices = await page.goto(`${voicesBase(target.name)}/settings/account`, { timeout: t(60000) });
      expect(voices!.status(), 'Voices /settings/account').toBe(404);
    } finally {
      await context.close();
    }
  });
});
