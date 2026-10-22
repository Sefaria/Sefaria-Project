import { test, expect } from '../fixtures';
import { keyValue } from '../gateway';
import { GATED, UNGATED, rawRequest, stamped, summary } from './util';

const RESTRICTED = { suite: 'gateway', name: 'restricted' };
const SITE = 'https://site-a.example.com';

test.describe('gateway origin restriction', () => {
  test('A3a: a restricted key with its exact website Origin is allowed', async ({ target, manifest }) => {
    const projectId = String(manifest.keys.find(k => k.suite === 'gateway' && k.name === 'restricted')!.projectId);
    const key = keyValue(RESTRICTED);
    for (const path of [GATED, UNGATED]) {
      if (target.hasEcho) {
        const echoed = await rawRequest({ target: target.name, host: 'echo', path, headers: { 'x-api-key': key, origin: SITE } });
        expect(echoed.status, summary(echoed)).toBe(200);
        expect(stamped(echoed)).toEqual({ tier: 'developer', project: projectId, result: 'ok' });
      }
    }
    const content = await rawRequest({ target: target.name, path: UNGATED, headers: { 'x-api-key': key, origin: SITE } });
    expect(content.status, summary(content)).toBe(200);
  });

  const refused: Array<{ label: string; origin?: string; named: string }> = [
    { label: 'another site', origin: 'https://site-b.example.com', named: 'https://site-b.example.com is not one' },
    { label: 'no Origin (a server-side caller)', named: 'a request without an Origin header is not one' },
    { label: 'Origin null', origin: 'null', named: 'null is not one' },
    { label: 'an upper-case variant', origin: 'https://SITE-A.example.com', named: 'https://SITE-A.example.com is not one' },
    { label: 'an explicit :443', origin: 'https://site-a.example.com:443', named: 'https://site-a.example.com:443 is not one' },
    { label: 'a trailing slash', origin: 'https://site-a.example.com/', named: 'https://site-a.example.com/ is not one' },
    { label: 'http instead of https', origin: 'http://site-a.example.com', named: 'http://site-a.example.com is not one' },
    { label: 'www. in front of the host', origin: 'https://www.site-a.example.com', named: 'https://www.site-a.example.com is not one' },
  ];
  for (const { label, origin, named } of refused) {
    test(`A3b: a restricted key with ${label} is 403 origin_not_allowed`, async ({ target }) => {
      for (const path of [GATED, UNGATED]) {
        const r = await rawRequest({
          target: target.name, path, headers: { 'x-api-key': keyValue(RESTRICTED), ...(origin !== undefined ? { origin } : {}) },
        });
        expect(r.status, `${path}: ${summary(r)}`).toBe(403);
        expect(r.code).toBe('origin_not_allowed');
        expect(r.headers['www-authenticate'], 'a 403 carries no www-authenticate').toBeUndefined();
        expect(r.error).toContain(named);
        expect(r.help).toBe('https://developers.sefaria.org/#origin_not_allowed');
      }
    });
  }

  test('N-CR3: a non-browser caller that forges the website Origin passes (documented limit of the restriction)', async ({ target }) => {
    const r = await rawRequest({
      target: target.name, path: UNGATED, headers: { 'x-api-key': keyValue(RESTRICTED), origin: SITE, 'user-agent': 'curl/8.7.1' },
    });
    expect(r.status, summary(r)).toBe(200);
    expect(r.code).toBeUndefined();
    test.info().annotations.push({
      type: 'finding',
      description: 'An Origin restriction stops only other browser sites; any script can send the header. UI copy must not promise more.',
    });
  });
});
