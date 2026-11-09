import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from '../fixtures';
import { keyValue } from '../gateway';
import {
  GATED, UNGATED, answeredByGateway, authsvcCounter, authsvcLogContains, localPsql, rawRequest, stamped, summary,
  unknownKey,
} from './util';

const OPEN = { suite: 'gateway', name: 'open' };
const REVOKED = { suite: 'gateway', name: 'revoked' };
const DELETED = { suite: 'gateway', name: 'deletedProject' };
const TIER_KEY = { suite: 'gateway', name: 'full5.1' };

const DENIAL_HELP = 'https://developers.sefaria.org/#';
const WWW_AUTH = 'ApiKey realm="sefaria"';

test.describe('gateway decisions', () => {
  test('A1: a valid open key is allowed on the gated and an ungated path, stamped developer/ok', async ({ target, manifest }) => {
    const key = keyValue(OPEN);
    const projectId = String(manifest.keys.find(k => k.suite === 'gateway' && k.name === 'open')!.projectId);
    const local = target.name === 'local';
    const okBefore = local ? await authsvcCounter('authsvc_decisions_total', { allow: 'true', result: 'ok' }) : 0;

    if (target.hasEcho) {
      for (const path of [GATED, UNGATED]) {
        const echoed = await rawRequest({ target: target.name, host: 'echo', path, headers: { 'x-api-key': key } });
        expect(echoed.status, summary(echoed)).toBe(200);
        expect(stamped(echoed)).toEqual({ tier: 'developer', project: projectId, result: 'ok' });
      }
    }

    const content = await rawRequest({ target: target.name, path: UNGATED, headers: { 'x-api-key': key } });
    expect(content.status, summary(content)).toBe(200);
    expect(content.json?.versions?.length, 'real text content').toBeGreaterThan(0);

    const gated = await rawRequest({
      target: target.name, path: GATED, method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: '{}',
    });
    expect(answeredByGateway(gated), `reached Django: ${summary(gated)}`).toBe(false);
    expect(gated.headers['www-authenticate'], summary(gated)).toBeUndefined();

    if (local) {
      const okAfter = await authsvcCounter('authsvc_decisions_total', { allow: 'true', result: 'ok' });
      expect(okAfter).toBeGreaterThanOrEqual(okBefore + 3);
    }
  });

  test('A2a: an unknown sfr_ key on the gated path is 401 api_key_invalid, logged by prefix only', async ({ target }) => {
    const since = new Date(Date.now() - 1000);
    const key = unknownKey();
    const r = await rawRequest({ target: target.name, path: GATED, headers: { 'x-api-key': key } });
    expect(r.status, summary(r)).toBe(401);
    expect(r.code).toBe('api_key_invalid');
    expect(r.error).toBe('The x-api-key is not valid for this project.');
    expect(r.help).toBe(DENIAL_HELP + 'api_key_invalid');
    expect(r.headers['www-authenticate']).toBe(WWW_AUTH);
    expect(r.headers['content-type']).toBe('application/json');
    expect(answeredByGateway(r)).toBe(true);

    await expect.poll(() => authsvcLogContains(since, `key_prefix=${key.slice(0, 12)} `, target.name), { timeout: 5000 }).toBe(true);
    expect(authsvcLogContains(since, key, target.name), 'the full key value is in the auth-service log').toBe(false);
  });

  const invalidOnUngated: Array<{ label: string; value: () => string }> = [
    { label: 'an unknown sfr_ key', value: () => unknownKey() },
    { label: 'a legacy-format key', value: () => unknownKey('').toLowerCase().slice(0, 32) },
    { label: 'a revoked key', value: () => keyValue(REVOKED) },
    { label: 'the key of a soft-deleted project', value: () => keyValue(DELETED) },
  ];
  for (const { label, value } of invalidOnUngated) {
    test(`A2b: ${label} on ungated paths is let through as anonymous @known-gap D2`, async ({ target }) => {
      const key = value();
      // The decision counter and the echo upstream exist on the local stack only (as in A1).
      const local = target.name === 'local';
      const invalidBefore = local ? await authsvcCounter('authsvc_decisions_total', { result: 'api_key_invalid' }) : 0;
      for (const path of [UNGATED, '/', '/static/css/s2.css']) {
        const r = await rawRequest({ target: target.name, path, headers: { 'x-api-key': key } });
        expect.soft([200, 301, 302], `${path}: ${summary(r)}`).toContain(r.status);
      }
      if (target.hasEcho) {
        const echoed = await rawRequest({ target: target.name, host: 'echo', path: UNGATED, headers: { 'x-api-key': key } });
        expect.soft(stamped(echoed), summary(echoed)).toEqual({ tier: 'anonymous', project: '', result: 'api_key_invalid' });
      }
      if (local) {
        const invalidAfter = await authsvcCounter('authsvc_decisions_total', { result: 'api_key_invalid' });
        expect(invalidAfter, 'the decision is still recorded as api_key_invalid').toBeGreaterThanOrEqual(invalidBefore + 4);
      }
    });
  }

  test('A2b: an invalid key on the gated path stays 401 api_key_invalid', async ({ target }) => {
    for (const key of [unknownKey(), keyValue(REVOKED), keyValue(DELETED)]) {
      const r = await rawRequest({ target: target.name, path: GATED, headers: { 'x-api-key': key } });
      expect(r.status, summary(r)).toBe(401);
      expect(r.code).toBe('api_key_invalid');
    }
  });

  test('A2c: an empty x-api-key header is treated as no key', async ({ target }) => {
    test.skip(!target.hasEcho, 'needs the echo upstream');
    const echoed = await rawRequest({ target: target.name, host: 'echo', path: UNGATED, headers: { 'x-api-key': '' } });
    expect(echoed.echo?.headers['x-api-key'], 'the empty header reached the gateway').toBe('');
    expect(stamped(echoed)).toEqual({ tier: 'anonymous', project: '', result: 'anonymous' });

    const gated = await rawRequest({ target: target.name, path: GATED, headers: { 'x-api-key': '' } });
    expect(gated.status, summary(gated)).toBe(401);
    expect(gated.code).toBe('api_key_required');
  });

  test('A2d: two x-api-key headers on the gated path are 401 api_key_invalid', async ({ target }) => {
    const key = keyValue(OPEN);
    for (const pair of [[key, key], [key, unknownKey()]]) {
      const r = await rawRequest({ target: target.name, path: GATED, headers: { 'x-api-key': pair } });
      expect(r.status, summary(r)).toBe(401);
      expect(r.code).toBe('api_key_invalid');
    }
  });

  test('A2d: two x-api-key headers on an ungated path are let through as anonymous @known-gap D2', async ({ target }) => {
    const key = keyValue(OPEN);
    for (const pair of [[key, key], [key, unknownKey()]]) {
      const r = await rawRequest({ target: target.name, path: UNGATED, headers: { 'x-api-key': pair } });
      expect.soft(r.status, summary(r)).toBe(200);
    }
  });

  for (const method of ['GET', 'POST'] as const) {
    test(`A4a: no key on the gated path (${method}) is 401 api_key_required`, async ({ target }) => {
      const r = await rawRequest({
        target: target.name, path: GATED, method,
        ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}),
      });
      expect(r.status, summary(r)).toBe(401);
      expect(r.code).toBe('api_key_required');
      expect(r.error).toBe('This route requires an x-api-key header.');
      expect(r.help).toBe(DENIAL_HELP + 'api_key_required');
      expect(r.headers['www-authenticate']).toBe(WWW_AUTH);
      expect(answeredByGateway(r)).toBe(true);
    });
  }

  test('A4b: a Bearer token alone on the gated path is 401 api_key_required', async ({ target }) => {
    const r = await rawRequest({
      target: target.name, path: GATED, method: 'POST',
      headers: { authorization: 'Bearer some.jwt.value', 'content-type': 'application/json' }, body: '{}',
    });
    expect(r.status, summary(r)).toBe(401);
    expect(r.code).toBe('api_key_required');
    expect(r.headers['www-authenticate']).toBe(WWW_AUTH);
  });

  test('A4c: Bearer and a valid key on the gated path reach Django, which checks the Bearer itself', async ({ target }) => {
    const r = await rawRequest({
      target: target.name, path: GATED, method: 'POST',
      headers: { 'x-api-key': keyValue(OPEN), authorization: 'Bearer not-a-real-token', 'content-type': 'application/json' },
      body: '{"query":"light"}',
    });
    expect(answeredByGateway(r), summary(r)).toBe(false);
    expect(r.status, summary(r)).toBe(401);
    expect(r.json).toEqual({ error: 'Unauthorized' });
    expect(r.headers['www-authenticate']).toBeUndefined();
  });

  test('A5a: OPTIONS with an Origin and no key on the gated path is a preflight that Django answers', async ({ target }) => {
    const origin = 'https://site-b.example.com';
    if (target.hasEcho) {
      const echoed = await rawRequest({ target: target.name, host: 'echo', path: GATED, method: 'OPTIONS', headers: { origin } });
      expect(echoed.status, summary(echoed)).toBe(200);
      expect(stamped(echoed)).toEqual({ tier: 'embed', project: '', result: 'preflight' });
    }
    const r = await rawRequest({
      target: target.name, path: GATED, method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST' },
    });
    expect(answeredByGateway(r), summary(r)).toBe(false);
    expect(r.code, summary(r)).toBeUndefined();
  });

  test('A5b: OPTIONS without an Origin on the gated path is 401 api_key_required', async ({ target }) => {
    const r = await rawRequest({ target: target.name, path: GATED, method: 'OPTIONS' });
    expect(r.status, summary(r)).toBe(401);
    expect(r.code).toBe('api_key_required');
  });

  test('A5c: OPTIONS checks a key before the preflight rule', async ({ target }) => {
    const wrongOrigin = await rawRequest({
      target: target.name, path: GATED, method: 'OPTIONS',
      headers: { origin: 'https://site-b.example.com', 'x-api-key': keyValue({ suite: 'gateway', name: 'restricted' }) },
    });
    expect(wrongOrigin.status, summary(wrongOrigin)).toBe(403);
    expect(wrongOrigin.code).toBe('origin_not_allowed');

    const unknown = await rawRequest({
      target: target.name, path: GATED, method: 'OPTIONS', headers: { origin: 'https://site-a.example.com', 'x-api-key': unknownKey() },
    });
    expect(unknown.status, summary(unknown)).toBe(401);
    expect(unknown.code).toBe('api_key_invalid');
  });

  test('N-A5: a key sent as a Bearer token is ignored: anonymous on ungated paths, 401 on the gated one', async ({ target }) => {
    const authorization = `Bearer ${keyValue(OPEN)}`;
    if (target.hasEcho) {
      const echoed = await rawRequest({ target: target.name, host: 'echo', path: UNGATED, headers: { authorization } });
      expect(stamped(echoed), summary(echoed)).toEqual({ tier: 'anonymous', project: '', result: 'jwt_pending' });
    }
    const gated = await rawRequest({ target: target.name, path: GATED, headers: { authorization } });
    expect(gated.status, summary(gated)).toBe(401);
    expect(gated.code).toBe('api_key_required');
  });

  test('N-A11: a tier change on the project reaches the next request', async ({ target, manifest }) => {
    test.skip(target.name !== 'local', 'writes the project row directly; local stack only');
    const projectId = manifest.keys.find(k => k.suite === 'gateway' && k.name === TIER_KEY.name)!.projectId;
    // the manifest's key projectId is the api_project id, the row that holds the tier
    const apiProject = String(Number(projectId));
    const key = keyValue(TIER_KEY);
    const tierOf = async () => stamped(await rawRequest({ target: target.name, host: 'echo', path: UNGATED, headers: { 'x-api-key': key } })).tier;

    expect(await tierOf()).toBe('developer');
    try {
      const started = Date.now();
      localPsql(`UPDATE api_project SET tier_id = 'partner', updated_at = now() WHERE id = ${apiProject}`);
      await expect.poll(tierOf, { timeout: 5000, intervals: [100] }).toBe('partner');
      test.info().annotations.push({ type: 'latency', description: `new tier seen after ${Date.now() - started} ms` });
    } finally {
      localPsql(`UPDATE api_project SET tier_id = 'developer', updated_at = now() WHERE id = ${apiProject}`);
    }
    await expect.poll(tierOf, { timeout: 5000, intervals: [100] }).toBe('developer');
  });

  test('N-CR10: every help URL in a denial body resolves to a page', async ({ target }) => {
    const helps = new Set<string>();
    const required = await rawRequest({ target: target.name, path: GATED });
    const invalid = await rawRequest({ target: target.name, path: GATED, headers: { 'x-api-key': unknownKey() } });
    const origin = await rawRequest({
      target: target.name, path: GATED, headers: { 'x-api-key': keyValue({ suite: 'gateway', name: 'restricted' }) },
    });
    for (const r of [required, invalid, origin]) {
      expect(r.help, summary(r)).toMatch(/^https:\/\/developers\.sefaria\.org\/#/);
      helps.add(r.help!);
    }
    expect(helps.size).toBe(3);
    const ctx = await playwrightRequest.newContext();
    try {
      for (const url of helps) {
        const response = await ctx.get(url, { failOnStatusCode: false, maxRedirects: 5, timeout: 20000 });
        expect.soft(response.status(), url).toBe(200);
      }
    } finally {
      await ctx.dispose();
    }
  });
});
