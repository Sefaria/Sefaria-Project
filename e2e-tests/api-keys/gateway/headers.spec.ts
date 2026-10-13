import { test, expect } from '../fixtures';
import { LOCAL_PORTS } from '../env';
import { keyValue } from '../gateway';
import { GATED, UNGATED, rawRequest, stamped, summary, unknownKey } from './util';

const OPEN = { suite: 'gateway', name: 'open' };
const SPOOF = { 'x-sefaria-tier': 'partner', 'x-sefaria-project': '999', 'x-sefaria-auth-result': 'ok' };

test.describe('gateway request headers', () => {
  test.beforeEach(({ target }) => {
    test.skip(!target.hasEcho, 'needs the echo upstream to see what the upstream receives');
  });

  test('A7: spoofed x-sefaria-* headers never reach the upstream (strip listener)', async ({ target, manifest }) => {
    const projectId = String(manifest.keys.find(k => k.suite === 'gateway' && k.name === 'open')!.projectId);
    const anonymous = await rawRequest({ target: target.name, host: 'echo', path: UNGATED, headers: SPOOF });
    expect(stamped(anonymous), summary(anonymous)).toEqual({ tier: 'anonymous', project: '', result: 'anonymous' });

    const keyed = await rawRequest({ target: target.name, host: 'echo', path: UNGATED, headers: { ...SPOOF, 'x-api-key': keyValue(OPEN) } });
    expect(stamped(keyed), summary(keyed)).toEqual({ tier: 'developer', project: projectId, result: 'ok' });

    const denied = await rawRequest({ target: target.name, host: 'echo', path: GATED, headers: SPOOF });
    expect(denied.status, summary(denied)).toBe(401);
    expect(denied.code).toBe('api_key_required');
    expect(denied.echo, 'a denied request reached the upstream').toBeUndefined();
    for (const name of Object.keys(SPOOF)) expect(denied.headers[name], `${name} echoed on a denial`).toBeUndefined();
  });

  test('N-A3: an empty-valued x-sefaria-project overwrites a spoofed one on the listener without the strip', async ({ target }) => {
    test.skip(!target.hasStripOffListener, 'needs the :10081 listener');
    for (const path of [UNGATED, '/']) {
      const r = await rawRequest({ target: target.name, host: 'echo', path, port: LOCAL_PORTS.envoyNoStrip, headers: SPOOF });
      expect(r.echo, summary(r)).toBeDefined();
      expect(r.echo!.headers).toHaveProperty('x-sefaria-project', '');
      expect(stamped(r)).toEqual({ tier: 'anonymous', project: '', result: 'anonymous' });
    }
    const embed = await rawRequest({
      target: target.name, host: 'echo', path: UNGATED, port: LOCAL_PORTS.envoyNoStrip,
      headers: { ...SPOOF, origin: 'https://site-b.example.com' },
    });
    expect(stamped(embed)).toEqual({ tier: 'embed', project: '', result: 'embed' });
  });

  test('N-A6: ?api_key= is removed before the upstream on ungated paths and is not a key transport', async ({ target }) => {
    const key = keyValue(OPEN);
    const r = await rawRequest({ target: target.name, host: 'echo', path: `${UNGATED}?api_key=${encodeURIComponent(key)}&a=1` });
    expect(r.status, summary(r)).toBe(200);
    expect(r.echo!.originalUrl).toBe(`${UNGATED}?a=1`);
    expect(stamped(r), 'the query key is not used to identify the caller').toEqual({ tier: 'anonymous', project: '', result: 'anonymous' });

    const gated = await rawRequest({ target: target.name, path: `${GATED}?api_key=${encodeURIComponent(key)}` });
    expect(gated.status, summary(gated)).toBe(401);
    expect(gated.code).toBe('api_key_required');
  });

  test('N-A7: header-name case and value padding do not matter; an inner space makes the key invalid', async ({ target, manifest }) => {
    const projectId = String(manifest.keys.find(k => k.suite === 'gateway' && k.name === 'open')!.projectId);
    const key = keyValue(OPEN);
    const want = { tier: 'developer', project: projectId, result: 'ok' };
    const upper = await rawRequest({ target: target.name, host: 'echo', path: GATED, headers: { 'X-API-KEY': key } });
    expect(stamped(upper), summary(upper)).toEqual(want);
    const padded = await rawRequest({ target: target.name, host: 'echo', path: GATED, headers: { 'x-api-key': `   ${key}   ` } });
    expect(stamped(padded), summary(padded)).toEqual(want);
    const inner = await rawRequest({ target: target.name, path: GATED, headers: { 'x-api-key': `${key.slice(0, 10)} ${key.slice(10)}` } });
    expect(inner.status, summary(inner)).toBe(401);
    expect(inner.code).toBe('api_key_invalid');
  });

  test('A10: oversized headers get 431 from Envoy; a 50 KB key gets a prompt 401 api_key_invalid', async ({ target }) => {
    const bigKey = unknownKey() + 'a'.repeat(50 * 1024);
    const big = await rawRequest({ target: target.name, path: UNGATED, headers: { 'x-api-key': bigKey }, timeoutMs: 10000 });
    expect(big.status, summary(big)).toBe(401);
    expect(big.code).toBe('api_key_invalid');
    expect(big.elapsedMs).toBeLessThan(5000);

    const pad = 'p'.repeat(40 * 1024);
    const huge = await rawRequest({ target: target.name, path: GATED, headers: { 'x-pad-1': pad, 'x-pad-2': pad }, timeoutMs: 10000 });
    expect(huge.status, summary(huge)).toBe(431);
    expect(huge.code, 'denied before ext_authz').toBeUndefined();
  });
});
