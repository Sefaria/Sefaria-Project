import { Response } from '@playwright/test';
import { test, expect } from '../fixtures';
import { rawRequest } from '../gateway/util';
import { t } from '../../globals';
import {
  SITE_B, LOCAL_LAUNCH_ARGS, TlsFront, apiBase, describeFetch, fetchFromPage, openForeignPage, watchRefusals,
} from './browser';

/**
 * Linker v3 on a third-party page: the script and its API calls (`websites`, the preflighted
 * `find-refs` POST, `async` polling) come from the target while the page is on another origin.
 */

const ARTICLE = `<!doctype html><html><head><title>Linker host page</title></head><body>
<div id="article"><p>In the beginning (Genesis 1:1), and later Exodus 3:14 and Berakhot 2a.</p></div>
</body></html>`;

test.use({ launchOptions: process.env.APIKEYS_TARGET === 'local' ? { args: LOCAL_LAUNCH_ARGS } : {} });

test.describe('linker on a third-party site', () => {
  test.describe.configure({ timeout: t(240000) });
  let front: TlsFront | undefined;
  test.beforeAll(async () => {
    if (process.env.APIKEYS_TARGET === 'local') front = await TlsFront.start();
  });
  test.afterAll(async () => {
    await front?.stop();
  });

  async function linkerBundleServed(target: 'local' | 'cauldron'): Promise<boolean> {
    const r = await rawRequest({ target, path: '/linker.v3.js' });
    return r.status === 200 && /javascript/.test(r.headers['content-type'] || '');
  }

  test('B3: the linker\'s request shapes from a third-party page pass the gateway and CORS', async ({ browser, target }) => {
    const api = apiBase(target.name, front);
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await openForeignPage(context, SITE_B, ARTICLE);
    try {
      const websites = await fetchFromPage(page, `${api}/api/websites/site-b.example.com`);
      expect(websites.blocked, describeFetch(websites)).toBe(false);
      expect(websites.status, describeFetch(websites)).toBe(200);

      const findRefs = await fetchFromPage(page, `${api}/api/find-refs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: { title: 'Linker host page', body: 'In the beginning (Genesis 1:1).' }, metaDataForTracking: { url: `${SITE_B}/`, title: 'Linker host page', description: '' } }),
      });
      expect(findRefs.blocked, `preflighted find-refs: ${describeFetch(findRefs)}`).toBe(false);
      expect(findRefs.status, describeFetch(findRefs)).toBe(202);
      expect(findRefs.json?.task_id, describeFetch(findRefs)).toBeTruthy();

      const poll = await fetchFromPage(page, `${api}/api/async/${findRefs.json.task_id}`);
      expect(poll.blocked, describeFetch(poll)).toBe(false);
      expect([200, 202], describeFetch(poll)).toContain(poll.status);
      expect(poll.json, describeFetch(poll)).toHaveProperty('state');
    } finally {
      await context.close();
    }
  });

  async function runLinker(browser: any, target: 'local' | 'cauldron') {
    const api = apiBase(target, front);
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const html = ARTICLE.replace('</body>', `<script src="${api}/linker.v3.js"></script></body>`);
    const page = await openForeignPage(context, SITE_B, html);
    const refusals = watchRefusals(page, target);
    const calls: Array<{ method: string; path: string; status: number }> = [];
    page.on('response', (response: Response) => {
      const url = new URL(response.url());
      if (url.origin === api && url.pathname.startsWith('/api/')) {
        calls.push({ method: response.request().method(), path: url.pathname, status: response.status() });
      }
    });
    await page.waitForFunction(() => typeof (window as any).sefaria?.link === 'function', null, { timeout: t(60000) });
    await page.evaluate(api => (window as any).sefaria.link({ sefariaUrl: api }), api);
    return { context, page, refusals, calls };
  }

  test('B3: the linker script, websites lookup, find-refs and async polling all pass the gateway', async ({ browser, target }) => {
    test.skip(!(await linkerBundleServed(target.name)), `/linker.v3.js is not built on ${target.name}`);
    const { context, refusals, calls } = await runLinker(browser, target.name);
    try {
      await expect.poll(() => calls.some(c => c.path.startsWith('/api/async/')), { timeout: t(60000), message: 'the linker polled its find-refs task' }).toBe(true);
    } finally {
      await context.close();
    }
    test.info().annotations.push({ type: 'evidence', description: JSON.stringify(calls.slice(0, 8)) });
    expect(refusals, JSON.stringify(refusals)).toEqual([]);
    const websites = calls.find(c => c.path.startsWith('/api/websites/'));
    const findRefs = calls.find(c => c.path === '/api/find-refs' && c.method === 'POST');
    expect(websites?.status, 'websites lookup').toBe(200);
    expect(findRefs?.status, 'find-refs POST after its preflight').toBe(202);
  });

  test('B3: links appear on the third-party page', async ({ browser, target }) => {
    const health = await rawRequest({ target: target.name, path: '/healthz' });
    const probe = await rawRequest({
      target: target.name, path: '/api/find-refs', method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: { title: '', body: 'Genesis 1:1' } }),
    });
    let worker = false;
    for (let i = 0; i < 10 && probe.json?.task_id && !worker; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const state = await rawRequest({ target: target.name, path: `/api/async/${probe.json.task_id}` });
      worker = state.json?.state === 'SUCCESS';
    }
    test.skip(!(await linkerBundleServed(target.name)), `/linker.v3.js is not built on ${target.name}`);
    test.skip(!worker, `no find-refs worker answers on ${target.name} (healthz ${health.status}); links cannot appear`);

    const { context, page, refusals } = await runLinker(browser, target.name);
    try {
      await expect(page.locator('#article a.sefaria-ref').first()).toBeVisible({ timeout: t(90000) });
      const refs = await page.locator('#article a.sefaria-ref').evaluateAll(as => as.map(a => a.getAttribute('data-ref')));
      expect(refs).toEqual(expect.arrayContaining(['Genesis 1:1']));
    } finally {
      await context.close();
    }
    expect(refusals, JSON.stringify(refusals)).toEqual([]);
  });
});
