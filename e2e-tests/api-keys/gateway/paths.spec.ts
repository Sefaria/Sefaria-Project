import { test, expect } from '../fixtures';
import { A_SERIES, GATED, KEEPUNCHANGED_PORT, RawResult, answeredByGateway, rawRequest, sh, summary } from './util';

function expectRequired(r: RawResult, what: string) {
  expect(r.status, `${what}: ${summary(r)}`).toBe(401);
  expect(r.code, what).toBe('api_key_required');
  expect(answeredByGateway(r), `${what} reached an upstream`).toBe(true);
}

test.describe('gateway path gating', () => {
  const variants = [
    '/api/%6bnn-search',
    '//api/knn-search',
    '/api/./knn-search',
    '/api/../api/knn-search',
    '/api/knn%2Dsearch',
    '/api/knn-search/',
    '/api/knn-search-v2',
    '/api/knn-search?x=1',
    '/api/knn-search?api_key=x',
  ];
  for (const path of variants) {
    test(`A6a: gated path variant ${path} is 401 api_key_required and never reaches Django`, async ({ target }) => {
      for (const method of ['GET', 'POST']) {
        expectRequired(await rawRequest({ target: target.name, path, method, body: method === 'POST' ? '{}' : undefined }), method);
      }
    });
  }

  test('A6a: /api%2Fknn-search is redirected to the gated path, which then denies', async ({ target }) => {
    for (const path of ['/api%2Fknn-search', '/api%2fknn-search', '/x/..%2Fapi/knn-search']) {
      const r = await rawRequest({ target: target.name, path });
      expect(r.status, `${path}: ${summary(r)}`).toBe(307);
      expect(r.headers['location']).toBe(GATED);
      expectRequired(await rawRequest({ target: target.name, path: r.headers['location'] }), `${path} followed`);
    }
  });

  test('A6c: /API/knn-search is not gated, and Django 404s it, so it is not a bypass', async ({ target }) => {
    for (const path of ['/API/knn-search', '/api/KNN-search']) {
      const r = await rawRequest({ target: target.name, path, method: 'POST', body: '{}' });
      expect(r.status, `${path}: ${summary(r)}`).toBe(404);
      expect(r.code).toBeUndefined();
      expect(answeredByGateway(r)).toBe(false);
    }
  });

  test('N-CR9: malformed encodings of the gated path never reach the knn view', async ({ target }) => {
    const cases: Array<[string, number[]]> = [
      ['/api/knn-search%zz', [400, 401]],
      ['/api/%6bnn-search%', [400, 401]],
      ['/api/knn-search;x', [400, 401]],
      ['/api/knn-search%00', [400, 401]],
      // Decodes once to /api/%6bnn-search, which neither the gate nor Django's router treats as the knn route.
      ['/api/%256bnn-search', [400, 401, 404]],
    ];
    for (const [path, allowed] of cases) {
      const r = await rawRequest({ target: target.name, path, method: 'POST', body: '{}' });
      expect.soft(allowed, `${path}: ${summary(r)}`).toContain(r.status);
      if (r.status === 401) expect.soft(r.code, path).toBe('api_key_required');
    }
  });

  test('N-A1: with KEEP_UNCHANGED for escaped slashes, /api%2Fknn-search is still gated', async ({ target }) => {
    test.skip(target.name !== 'local', 'the cauldron half runs after the master merge and a pin bump');
    test.setTimeout(120000);
    const start = sh('bash', [A_SERIES, 'keepunchanged-envoy', 'start']);
    expect(start.status, start.stderr || start.stdout).toBe(0);
    try {
      for (const path of ['/api%2Fknn-search', '/api%2fknn-search', '/x/..%2Fapi/knn-search', '/api/%6bnn-search']) {
        const r = await rawRequest({ target: target.name, path, port: KEEPUNCHANGED_PORT });
        if (r.status >= 300 && r.status < 400) {
          expectRequired(await rawRequest({ target: target.name, path: r.headers['location'], port: KEEPUNCHANGED_PORT }), `${path} followed`);
        } else {
          expectRequired(r, `${path} (KEEP_UNCHANGED)`);
        }
      }
    } finally {
      sh('bash', [A_SERIES, 'keepunchanged-envoy', 'stop']);
    }
  });
});
