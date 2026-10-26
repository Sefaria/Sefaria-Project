import { test, expect } from '../fixtures';
import { A_SERIES, GATED, KEEPUNCHANGED_PORT, RawResult, answeredByGateway, rawRequest, sh, summary } from './util';

function expectRequired(r: RawResult, what: string) {
  expect(r.status, `${what}: ${summary(r)}`).toBe(401);
  expect(r.code, what).toBe('api_key_required');
  expect(answeredByGateway(r), `${what} reached an upstream`).toBe(true);
}

/**
 * Django refused the request without running a view: a 404, or, on the HTTPS cauldron, the CSRF
 * 403 a Referer-less POST gets first. The knn view is CSRF-exempt, so that 403 also proves the
 * request never reached it.
 */
function expectDjangoRefusal(r: RawResult, what: string) {
  const csrf = r.status === 403 && /CSRF verification failed/.test(r.body);
  expect(r.status === 404 || csrf, `${what}: ${summary(r)}`).toBe(true);
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

  test('A6a: /api%2Fknn-search is redirected to the gated path (or denied directly), and denied', async ({ target }) => {
    for (const path of ['/api%2Fknn-search', '/api%2fknn-search', '/x/..%2Fapi/knn-search']) {
      const r = await rawRequest({ target: target.name, path });
      // The cluster's ClientTrafficPolicy keeps escaped slashes unchanged (N-M9), so there the gate
      // may deny the path directly instead of redirecting first, as N-A1 allows locally.
      const allowed = target.name === 'local' ? [307] : [307, 401];
      expect(allowed, `${path}: ${summary(r)}`).toContain(r.status);
      if (r.status === 307) {
        expect(r.headers['location'], path).toBe(GATED);
        expectRequired(await rawRequest({ target: target.name, path: r.headers['location'] }), `${path} followed`);
      } else {
        expectRequired(r, path);
      }
    }
  });

  test('A6c: /API/knn-search is not gated, and Django refuses it, so it is not a bypass', async ({ target }) => {
    for (const path of ['/API/knn-search', '/api/KNN-search']) {
      const r = await rawRequest({ target: target.name, path, method: 'POST', body: '{}' });
      expectDjangoRefusal(r, path);
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
      // A 404 from Django may arrive as its CSRF 403 on the HTTPS cauldron; see expectDjangoRefusal.
      const csrf = r.status === 403 && /CSRF verification failed/.test(r.body);
      expect.soft(allowed, `${path}: ${summary(r)}`).toContain(csrf ? 404 : r.status);
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
