import { test, expect } from '../fixtures';
import { findAccount, readPassword } from '../env';
import { keyValue } from '../gateway';
import { GATED, RawResult, answeredByGateway, rawRequest } from '../gateway/util';

/**
 * Request shapes of the known callers, replayed from Node exactly as each client sends them.
 * "Reached Django" is told apart from "refused by the gateway" by Envoy's upstream-time header
 * and by the gateway's JSON `code`, which Django never sends.
 */

const OPEN_KEY = { suite: 'gateway', name: 'open' };

/** Status and the error fields only: these responses can carry session cookies and JWTs. */
function brief(r: RawResult): string {
  const fields = r.json && typeof r.json === 'object' && !Array.isArray(r.json)
    ? JSON.stringify({ code: r.json.code, error: r.json.error, detail: r.json.detail, _auth: r.json._auth })
    : r.body.slice(0, 120).replace(/\s+/g, ' ');
  return `${r.status} ${fields}`;
}

function expectPassedGateway(r: RawResult, label: string) {
  expect(answeredByGateway(r), `${label}: refused by the gateway: ${brief(r)}`).toBe(false);
  expect(r.code, `${label}: ${brief(r)}`).toBeUndefined();
}

function cookieValue(setCookie: string | undefined, name: string): string | undefined {
  const match = (setCookie || '').match(new RegExp(`(?:^|[,;]\\s*)${name}=([^;,]+)`));
  return match?.[1];
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

test.describe('caller replays', () => {
  test('B4: mobile app shapes work: JWT login, Bearer profile sync, private GET, refresh, //api/bulktext', async ({ target }) => {
    const mobile = findAccount('callers', 'mobile');
    const ua = 'Sefaria/mobile-ios';
    const json = { 'content-type': 'application/json;charset=UTF-8', 'user-agent': ua };

    const login = await rawRequest({
      target: target.name, path: '/api/login/', method: 'POST', headers: json,
      body: JSON.stringify({ username: mobile.email, password: readPassword() }),
    });
    expectPassedGateway(login, 'api/login/');
    expect(login.status, brief(login)).toBe(200);
    const access: string = login.json?.access;
    const refresh: string = login.json?.refresh;
    expect(typeof access === 'string' && typeof refresh === 'string', 'login returned access and refresh tokens').toBe(true);
    const bearer = `Bearer ${access}`;

    const sync = await rawRequest({
      target: target.name, path: '/api/profile/sync', method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': ua },
      body: form({ user_history: '[]', last_sync: '0' }),
    });
    expectPassedGateway(sync, 'api/profile/sync');
    expect(sync.status, brief(sync)).toBe(200);
    expect(sync.json?.error, `Django did not accept the JWT: ${brief(sync)}`).toBeUndefined();
    expect(sync.json).toHaveProperty('last_sync');

    const privateGet = await rawRequest({
      target: target.name, path: '/api/notes/all?private=1', headers: { authorization: bearer, 'user-agent': ua },
    });
    expectPassedGateway(privateGet, 'private GET');
    expect(privateGet.status, brief(privateGet)).toBe(200);
    expect(Array.isArray(privateGet.json), `the private GET answered as the user, not anonymously: ${brief(privateGet)}`).toBe(true);

    const anonymousControl = await rawRequest({ target: target.name, path: '/api/notes/all?private=1', headers: { 'user-agent': ua } });
    expect(Array.isArray(anonymousControl.json), 'without the Bearer the same GET is refused by Django').toBe(false);

    const refreshed = await rawRequest({
      target: target.name, path: '/api/login/refresh/', method: 'POST', headers: json, body: JSON.stringify({ refresh }),
    });
    expectPassedGateway(refreshed, 'api/login/refresh/');
    expect(refreshed.status, brief(refreshed)).toBe(200);
    expect(typeof refreshed.json?.access).toBe('string');

    const bulk = await rawRequest({ target: target.name, path: '//api/bulktext/Genesis.1.1', headers: { 'user-agent': ua } });
    expectPassedGateway(bulk, '//api/bulktext/');
    expect(bulk.status, brief(bulk)).toBe(200);
    expect(bulk.json?.['Genesis.1.1'] ?? bulk.json?.['Genesis 1:1'], `bulktext content: ${brief(bulk)}`).toBeTruthy();
  });

  test('B5: Library Assistant knn shape: Bearer alone is 401 api_key_required; Bearer and a key pass the gateway', async ({ target }) => {
    const headers = { 'content-type': 'application/json', 'user-agent': 'Sefaria/library-assistant (prod)' };
    const body = JSON.stringify({ query: 'light', result_limit: 3, linked_ref_limit: 3, include_linked_refs: true });

    const bearerOnly = await rawRequest({ target: target.name, path: GATED, method: 'POST', headers: { ...headers, authorization: 'Bearer la-replay' }, body });
    expect(bearerOnly.status, brief(bearerOnly)).toBe(401);
    expect(bearerOnly.code).toBe('api_key_required');
    expect(answeredByGateway(bearerOnly)).toBe(true);

    const withKey = await rawRequest({
      target: target.name, path: GATED, method: 'POST',
      headers: { ...headers, authorization: 'Bearer la-replay', 'x-api-key': keyValue(OPEN_KEY) }, body,
    });
    expectPassedGateway(withKey, 'Bearer + key');
    expect(withKey.status, `Django checks the Bearer itself: ${brief(withKey)}`).toBe(401);
    expect(withKey.json).toEqual({ error: 'Unauthorized' });
    expect(withKey.headers['www-authenticate']).toBeUndefined();
  });

  test('B5: Library Assistant knn with its real Bearer and key gets search results', async ({ target }) => {
    const bearer = process.env.APIKEYS_LA_BEARER;
    const laKey = process.env.APIKEYS_LA_KEY;
    test.skip(!bearer || !laKey, 'needs the Library Assistant Bearer and its sfr_ key in APIKEYS_LA_BEARER / APIKEYS_LA_KEY');
    const r = await rawRequest({
      target: target.name, path: GATED, method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Sefaria/library-assistant (prod)', authorization: `Bearer ${bearer}`, 'x-api-key': laKey! },
      body: JSON.stringify({ query: 'light', result_limit: 3, linked_ref_limit: 3, include_linked_refs: true }),
    });
    expectPassedGateway(r, 'LA knn');
    expect(r.status, brief(r)).toBe(200);
  });

  test('B6: sefaria-eval form login and session cookie work through the gateway', async ({ target }) => {
    const evalAccount = findAccount('callers', 'eval');
    const ua = 'Sefaria/sefaria-eval (overnight-e2e)';
    const loginPage = await rawRequest({ target: target.name, path: '/login', headers: { 'user-agent': ua } });
    expectPassedGateway(loginPage, 'GET /login');
    expect(loginPage.status, brief(loginPage)).toBe(200);
    const csrf = cookieValue(loginPage.headers['set-cookie'], 'csrftoken');
    expect(csrf, 'csrftoken cookie on the login page').toBeTruthy();

    const base = target.name === 'local' ? 'http://www.gateway.test:10080' : 'https://www.apikeys-pipeline.cauldron.sefaria.org';
    const posted = await rawRequest({
      target: target.name, path: '/login', method: 'POST',
      headers: {
        'user-agent': ua, 'content-type': 'application/x-www-form-urlencoded', referer: `${base}/login/`, cookie: `csrftoken=${csrf}`,
      },
      body: form({ csrfmiddlewaretoken: csrf!, email: evalAccount.email, password: readPassword(), next: '' }),
    });
    expectPassedGateway(posted, 'POST /login');
    expect(posted.body).not.toContain('errorlist');
    const session = cookieValue(posted.headers['set-cookie'], 'sessionid');
    expect(session, `sessionid cookie after the form login (${posted.status})`).toBeTruthy();

    const texts = await rawRequest({ target: target.name, path: '/texts', headers: { 'user-agent': ua, cookie: `sessionid=${session}` } });
    expectPassedGateway(texts, 'GET /texts');
    expect(texts.status, brief(texts)).toBe(200);
    expect(texts.body, 'the page props belong to the logged-in account').toContain(`"_uid": ${evalAccount.id}`);

    const health = await rawRequest({ target: target.name, path: '/api/texts/Genesis.1.1', headers: { 'user-agent': ua } });
    expect(health.status, brief(health)).toBe(200);
  });

  test('B6: sefaria-mcp read calls work anonymously', async ({ target }) => {
    const ua = 'Sefaria/sefaria-mcp (overnight-e2e)';
    // The local Django runs with the autocompleter off; on the cluster the name service answers /api/name.
    const calls = [
      '/api/v3/texts/Genesis.1.1',
      ...(target.name === 'cauldron' ? ['/api/name/Genesis?limit=5'] : []),
      '/api/links/Genesis.1.1',
      '/api/shape/Genesis',
      '/api/v2/raw/index/Genesis',
      '/api/v2/topics/shabbat',
    ];
    for (const path of calls) {
      const r = await rawRequest({ target: target.name, path, headers: { 'user-agent': ua } });
      expectPassedGateway(r, path);
      expect(r.status, `${path}: ${brief(r)}`).toBe(200);
    }
  });

  test('B7: an Apple form_post callback shape reaches Django, not a gateway denial', async ({ target }) => {
    const r = await rawRequest({
      target: target.name, path: '/api/auth/apple/callback', method: 'POST',
      headers: { origin: 'https://appleid.apple.com', 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ state: 'e2e', code: 'e2e', id_token: 'not-a-token' }),
    });
    expectPassedGateway(r, 'apple callback');
    expect(r.headers['www-authenticate']).toBeUndefined();
    expect(r.status, brief(r)).toBeGreaterThanOrEqual(400);
  });

  test('B8: webhooks with bad credentials get Django\'s own rejection (Formstack signature, Strapi Basic)', async ({ target }) => {
    const formstack = await rawRequest({
      target: target.name, path: '/api/powered-by', method: 'POST',
      headers: { 'content-type': 'application/json', 'x-fs-signature': 'sha256=' + '0'.repeat(64) },
      body: JSON.stringify({ FormID: 'e2e', project_name: 'E2E api-keys signature probe' }),
    });
    expectPassedGateway(formstack, 'powered-by');
    expect(formstack.status, brief(formstack)).toBe(401);
    expect(formstack.json).toEqual({ error: 'Unauthorized' });
    expect(formstack.headers['www-authenticate']).toBeUndefined();

    const strapi = await rawRequest({
      target: target.name, path: '/api/strapi/cache-invalidate', method: 'POST',
      headers: { authorization: 'Basic ' + Buffer.from('e2e:wrong').toString('base64'), 'content-type': 'application/json' },
      body: '{}',
    });
    expectPassedGateway(strapi, 'strapi cache-invalidate');
    if (target.name === 'local' && strapi.status === 500) {
      // The local settings define no WEBHOOK_USERNAME, so Django errors before comparing; the gateway still passed it.
      test.info().annotations.push({ type: 'evidence', description: 'local strapi cache-invalidate: Django 500 (WEBHOOK_USERNAME unset locally)' });
    } else {
      expect(strapi.status, brief(strapi)).toBe(401);
      expect(strapi.body.trim()).toBe('Invalid credentials');
    }
  });

  test('B10: a legacy Mongo key in x-api-key reaches Django and is accepted @known-gap D2', async ({ target, manifest }) => {
    const legacy = manifest.legacyKeys.find(k => k.suite === 'callers' && k.role === 'legacy');
    test.skip(!legacy, 'the manifest has no callers.legacy key (seed with --legacy-key callers.legacy)');
    const r = await rawRequest({ target: target.name, path: '/api/notes/Genesis.1.1?private=1', headers: { 'x-api-key': legacy!.value } });
    expect(r.code, `refused by the gateway: ${brief(r)}`).toBeUndefined();
    expect(r.status, brief(r)).toBe(200);
    expect(Array.isArray(r.json), brief(r)).toBe(true);
  });

  const knnCallers = [
    { who: 'the semantic-search cutover checker', ua: 'Sefaria-Semantic-Cutover-Check/1' },
    { who: 'export_knn_search_results.py', ua: 'python-requests/2.32.3' },
    { who: 'the sefaria-library plugin', ua: 'sefaria-library-plugin sefaria_lookup.py' },
    { who: 'an unknown urllib client', ua: 'Python-urllib/3.13' },
  ];
  for (const { who, ua } of knnCallers) {
    test(`N-B2: ${who} (Bearer, no key) is refused 401 api_key_required on knn-search`, async ({ target }) => {
      const r = await rawRequest({
        target: target.name, path: GATED, method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': ua, authorization: 'Bearer caller-replay' },
        body: JSON.stringify({ query: 'light' }),
      });
      expect(r.status, brief(r)).toBe(401);
      expect(r.code).toBe('api_key_required');
      expect(answeredByGateway(r)).toBe(true);
    });
  }

  test('N-B4: down-detector shapes reach Django: /healthz and find-refs with async polling', async ({ target }) => {
    const ua = 'Sefaria/down-detector';
    const health = await rawRequest({ target: target.name, path: '/healthz', headers: { 'user-agent': ua } });
    expectPassedGateway(health, '/healthz');
    test.info().annotations.push({ type: 'evidence', description: `/healthz ${health.status} ${health.body.slice(0, 200)}` });
    if (target.name === 'cauldron') expect(health.status, brief(health)).toBe(200);
    else expect(health.json, 'local /healthz answers its JSON status (no Node SSR locally, so allReady is false)').toHaveProperty('allReady');

    const started = await rawRequest({
      target: target.name, path: '/api/find-refs', method: 'POST',
      headers: { 'user-agent': ua, 'content-type': 'application/json' },
      body: JSON.stringify({ text: { title: '', body: 'In the beginning (Genesis 1:1).' } }),
    });
    expectPassedGateway(started, 'find-refs');
    expect(started.status, brief(started)).toBeLessThan(300);
    const taskId = started.json?.task_id;
    expect(taskId, brief(started)).toBeTruthy();

    const poll = await rawRequest({ target: target.name, path: `/api/async/${taskId}`, headers: { 'user-agent': ua } });
    expectPassedGateway(poll, 'async poll');
    expect([200, 202], brief(poll)).toContain(poll.status);
    expect(poll.json, brief(poll)).toHaveProperty('state');
  });
});
