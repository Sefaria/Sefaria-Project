import { test, expect } from '../fixtures';
import { keyValue } from '../gateway';
import { GATED, UNGATED, kubectlReadOnly, rawRequest, summary } from './util';

/** Cluster facts the local stack cannot show. Read-only: GETs and `kubectl get`. */
test.describe('gateway on the cauldron', () => {
  test.beforeEach(({ target }) => {
    test.skip(target.name !== 'cauldron', 'cauldron only');
  });

  test('N-A2: the x-sefaria-* strip is accepted on the cluster @known-gap N-A2', async ({ target }) => {
    const plain = await rawRequest({ target: target.name, path: GATED, plainHttp: true });
    test.info().annotations.push({
      type: 'evidence',
      description: `plain http:// gated path -> ${summary(plain)} (a 401 means port 80 reaches the route without a redirect)`,
    });

    const ctp = kubectlReadOnly(['get', 'clienttrafficpolicy', 'apikeys-pipeline', '-n', 'default', '-o', 'json']);
    expect(ctp.status, ctp.stderr).toBe(0);
    const policy = JSON.parse(ctp.stdout);
    expect(policy.spec?.headers?.earlyRequestHeaders?.remove).toEqual(
      expect.arrayContaining(['x-sefaria-tier', 'x-sefaria-project', 'x-sefaria-auth-result']),
    );
    const accepted = (policy.status?.ancestors || [])
      .flatMap((a: any) => a.conditions || [])
      .find((c: any) => c.type === 'Accepted');
    test.info().annotations.push({ type: 'evidence', description: `Accepted=${accepted?.status} ${accepted?.reason}: ${String(accepted?.message).slice(0, 200)}` });
    expect(accepted?.status, accepted?.message).toBe('True');
  });

  test('N-A8: the gated path is gated on every hostname of the route; allowed requests on the bare host get 301', async ({ target }) => {
    for (const host of ['www', 'bare', 'voices'] as const) {
      const r = await rawRequest({ target: target.name, host, path: GATED });
      expect(r.status, `${host}: ${summary(r)}`).toBe(401);
      expect(r.code).toBe('api_key_required');
    }
    const keyed = await rawRequest({ target: target.name, host: 'bare', path: UNGATED, headers: { 'x-api-key': keyValue({ suite: 'gateway', name: 'open' }) } });
    expect(keyed.status, summary(keyed)).toBe(301);
    expect(keyed.headers['location']).toMatch(/^https:\/\/www\./);
    const anonymous = await rawRequest({ target: target.name, host: 'bare', path: '/texts' });
    expect(anonymous.status, summary(anonymous)).toBe(301);
  });
});
