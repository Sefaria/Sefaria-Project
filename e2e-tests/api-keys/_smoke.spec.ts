import { test, expect } from './fixtures';
import { describe } from './gateway';
import { t } from '../globals';

test.describe('api-keys scaffold smoke', () => {
  test('SMOKE-1: a seeded account is logged in on the target', async ({ account }) => {
    const { page, account: seeded } = await account('gateway', 'open');
    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).Sefaria?._uid !== undefined, null, { timeout: t(30000) });
    expect(await page.evaluate(() => (window as any).Sefaria._uid)).toBe(seeded.id);
  });

  for (const method of ['GET', 'POST'] as const) {
    test(`A4a: no key on the gated path (${method}) is 401 api_key_required`, async ({ gw }) => {
      const result = await gw.call({ path: '/api/knn-search', method, data: method === 'POST' ? {} : undefined });
      expect(result.status, describe(result)).toBe(401);
      expect(result.code, describe(result)).toBe('api_key_required');
      expect(result.headers['www-authenticate']).toBe('ApiKey realm="sefaria"');
      expect(result.help).toMatch(/api_key_required$/);
    });
  }
});
