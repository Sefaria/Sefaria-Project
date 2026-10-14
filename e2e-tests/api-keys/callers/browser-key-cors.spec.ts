import { test, expect } from '../fixtures';
import { describe as describeCall, keyValue } from '../gateway';
import { SITE_A, SITE_B, LOCAL_LAUNCH_ARGS, TlsFront, apiBase, describeFetch, fetchFromPage, openForeignPage } from './browser';

/**
 * Website keys used from a browser on a third-party page. The key's website is site-a; site-b is
 * any other site. Both pages are served by a route that is removed before any API call, so the
 * Origin and the preflight are real.
 */

const RESTRICTED = { suite: 'gateway', name: 'restricted' };
const TEXT_PATH = '/api/v3/texts/Genesis.1.1';
const GATED = '/api/knn-search';

test.use({ launchOptions: process.env.APIKEYS_TARGET === 'local' ? { args: LOCAL_LAUNCH_ARGS } : {} });

test.describe('website keys in a browser', () => {
  let front: TlsFront | undefined;
  test.beforeAll(async () => {
    if (process.env.APIKEYS_TARGET === 'local') front = await TlsFront.start();
  });
  test.afterAll(async () => {
    await front?.stop();
  });

  test('C8 control: a third-party page can read an anonymous API response', async ({ browser, target }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await openForeignPage(context, SITE_B);
    const r = await fetchFromPage(page, apiBase(target.name, front) + TEXT_PATH);
    await context.close();
    expect(r.blocked, describeFetch(r)).toBe(false);
    expect(r.status, describeFetch(r)).toBe(200);
    expect(r.json?.versions?.length, 'text content readable in JS').toBeGreaterThan(0);
  });

  test('C8: a website key works from its own website, and the page can read the data @known-gap N-D7', async ({ browser, target }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await openForeignPage(context, SITE_A);
    const r = await fetchFromPage(page, apiBase(target.name, front) + TEXT_PATH, { headers: { 'x-api-key': keyValue(RESTRICTED) } });
    await context.close();
    expect(r.blocked, describeFetch(r)).toBe(false);
    expect(r.status, describeFetch(r)).toBe(200);
    expect(r.json?.versions?.length, 'text content readable in JS').toBeGreaterThan(0);
  });

  test('C8: the same key from another website is refused with a 403 the page can read @known-gap N-D7', async ({ browser, target }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await openForeignPage(context, SITE_B);
    const r = await fetchFromPage(page, apiBase(target.name, front) + TEXT_PATH, { headers: { 'x-api-key': keyValue(RESTRICTED) } });
    await context.close();
    expect(r.blocked, describeFetch(r)).toBe(false);
    expect(r.status, describeFetch(r)).toBe(403);
    expect(r.json?.code).toBe('origin_not_allowed');
  });

  test('A8: a gateway denial seen by a page on another origin has a body the page can read @known-gap N-D7', async ({ browser, target }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await openForeignPage(context, SITE_B);
    // A CORS-simple POST: no preflight, so the browser shows the page the denial itself.
    const r = await fetchFromPage(page, apiBase(target.name, front) + GATED, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"query":"light"}',
    });
    await context.close();
    expect(r.blocked, describeFetch(r)).toBe(false);
    expect(r.status, describeFetch(r)).toBe(401);
    expect(r.json?.code).toBe('api_key_required');
    expect(r.json?.help).toMatch(/api_key_required$/);
  });

  for (const path of [TEXT_PATH, '/api/texts/Genesis.1.1', GATED]) {
    test(`N-A4: a browser preflight for x-api-key on ${path} is answered with x-api-key in Allow-Headers @known-gap N-D7`, async ({ gw }) => {
      const r = await gw.options(path, {
        origin: SITE_A,
        headers: { 'Access-Control-Request-Method': path === GATED ? 'POST' : 'GET', 'Access-Control-Request-Headers': 'x-api-key' },
      });
      expect(r.code, `the gateway let the preflight through: ${describeCall(r)}`).toBeUndefined();
      expect(r.status, describeCall(r)).toBeLessThan(300);
      const allowHeaders = (r.headers['access-control-allow-headers'] || '').toLowerCase().split(/\s*,\s*/);
      expect(allowHeaders, `Access-Control-Allow-Headers: ${r.headers['access-control-allow-headers'] ?? '(none)'}`).toContain('x-api-key');
      expect(r.headers['access-control-allow-origin'], 'Access-Control-Allow-Origin').toBeTruthy();
    });
  }
});
