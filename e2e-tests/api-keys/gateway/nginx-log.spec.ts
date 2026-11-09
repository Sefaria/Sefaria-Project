import { test, expect } from '../fixtures';
import { CAULDRON_NAME, LOCAL_PORTS, maskSecrets } from '../env';
import { keyValue } from '../gateway';
import { GATED, STACK_PROJECT, UNGATED, kubectlReadOnly, rawRequest, sh, summary } from './util';
import * as http from 'http';

/**
 * N-LOG: what nginx writes to its access log. The log must carry the gateway's x-sefaria-* stamp (project, tier, auth
 * result) and never a key: not from the x-api-key header (no log field reads it), not from a query string (the scrub
 * maps), and a client-sent x-sefaria-* value never shows up as the stamp (the listener strips it, 3b).
 *
 * Locally the log is the stack's nginx container; on the cauldron, `kubectl logs` of the nginx pods (read-only).
 * Each test marks its requests with a unique User-Agent and reads only those lines. Log text is never printed unmasked.
 */
const NGINX_CONTAINER = `${STACK_PROJECT}-nginx-1`;
const OPEN = { suite: 'gateway', name: 'open' };

type LogLine = { raw: string; json: any };

function marker(): string {
  return `apikeys-e2e-log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Access-log lines whose User-Agent is `ua`, read since `since`. Retries for up to 10 s while the log catches up. */
async function nginxLines(target: 'local' | 'cauldron', since: Date, ua: string, want = 1): Promise<LogLine[]> {
  const deadline = Date.now() + 10000;
  for (;;) {
    const out = target === 'cauldron'
      ? kubectlReadOnly(['logs', '-n', 'default', '-l', `app=nginx-${CAULDRON_NAME}`, '-c', 'nginx',
        '--since-time', since.toISOString(), '--tail=-1', '--max-log-requests=20'])
      : sh('docker', ['logs', '--since', since.toISOString(), NGINX_CONTAINER]);
    if (out.status !== 0) throw new Error(`reading the nginx log failed: ${maskSecrets(out.stderr.trim()).slice(0, 300)}`);
    const lines = (out.stdout + '\n' + out.stderr).split('\n')
      .filter(l => l.includes(ua))
      .map(raw => {
        let json: any;
        try { json = JSON.parse(raw.slice(raw.indexOf('{'))); } catch { json = undefined; }
        return { raw, json };
      });
    if (lines.length >= want || Date.now() > deadline) return lines;
    await new Promise(r => setTimeout(r, 500));
  }
}

/** A request straight to the local stack's nginx (no Envoy in front), as merge-queue Playwright sees it. */
function directNginx(path: string, ua: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: LOCAL_PORTS.nginxDirect, path, headers: { Host: `www.gateway.test:${LOCAL_PORTS.nginxDirect}`, 'User-Agent': ua } },
      res => { res.resume(); res.on('end', () => resolve(res.statusCode || 0)); }).on('error', reject);
  });
}

test.describe('nginx access log', () => {
  test.beforeEach(({ target }) => {
    test.skip(!target.canReadNginxLog, 'needs read access to the nginx log');
  });

  test('N-LOG1: a keyed request is logged with its project, tier and result, and the key appears nowhere in the log', async ({ target, manifest }) => {
    const entry = manifest.keys.find(k => k.suite === 'gateway' && k.name === 'open');
    test.skip(!entry, 'needs a seeded manifest for this target (the cauldron runner\'s seeded mode)');
    const key = keyValue(OPEN);
    const ua = marker();
    const since = new Date(Date.now() - 2000);
    const r = await rawRequest({ target: target.name, path: UNGATED, headers: { 'x-api-key': key, 'User-Agent': ua } });
    expect(r.status, summary(r)).toBe(200);

    const lines = await nginxLines(target.name, since, ua);
    expect(lines.length, 'the keyed request has an nginx access-log line').toBeGreaterThanOrEqual(1);
    const line = lines[lines.length - 1];
    expect(line.json, 'the access-log line is the structured JSON format').toBeDefined();
    expect({ project: line.json.sefariaProject, tier: line.json.sefariaTier, result: line.json.sefariaAuthResult })
      .toEqual({ project: String(entry!.projectId), tier: 'developer', result: 'ok' });
    for (const l of lines) {
      expect(l.raw.includes(key), 'the key value is in an nginx log line').toBe(false);
      expect(l.raw.includes(key.slice(0, 12)), 'a 12-character key prefix is in an nginx log line').toBe(false);
    }
  });

  test('N-LOG2: a spoofed x-sefaria-* stamp is not what nginx logs (stripped before ext_authz, 3b)', async ({ target }) => {
    const ua = marker();
    const since = new Date(Date.now() - 2000);
    const spoof = { 'x-sefaria-tier': 'partner', 'x-sefaria-project': '999', 'x-sefaria-auth-result': 'ok', 'User-Agent': ua };
    const allowed = await rawRequest({ target: target.name, path: UNGATED, headers: spoof });
    expect(allowed.status, summary(allowed)).toBe(200);
    const lines = await nginxLines(target.name, since, ua);
    expect(lines.length, 'the spoofed request has an nginx access-log line').toBeGreaterThanOrEqual(1);
    const logged = lines[lines.length - 1].json;
    expect({ project: logged.sefariaProject, tier: logged.sefariaTier, result: logged.sefariaAuthResult },
      'the log carries the gateway\'s stamp, not the client\'s').toEqual({ project: '', tier: 'anonymous', result: 'anonymous' });
  });

  test('N-LOG3: a denied gated request never reaches nginx', async ({ target }) => {
    const ua = marker();
    const since = new Date(Date.now() - 2000);
    const denied = await rawRequest({ target: target.name, path: GATED, headers: { 'User-Agent': ua } });
    expect(denied.status, summary(denied)).toBe(401);
    expect(denied.code).toBe('api_key_required');
    // Give the log the same time a logged request takes, then expect nothing.
    await new Promise(r => setTimeout(r, 2000));
    const lines = await nginxLines(target.name, since, ua, 0);
    expect(lines.length, 'a gateway denial produced an nginx access-log line').toBe(0);
  });

  test('N-LOG4: an api_key in the query string is logged as [REDACTED] by nginx itself', async ({ target }) => {
    test.skip(target.name !== 'local', 'needs nginx without Envoy in front (Envoy already drops ?api_key= on the route)');
    const secret = `sfr_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const ua = marker();
    const since = new Date(Date.now() - 2000);
    await directNginx(`${UNGATED}?api_key=${secret}&a=1&APIKEY=${secret}`, ua);
    const lines = await nginxLines(target.name, since, ua);
    expect(lines.length, 'the request has an nginx access-log line').toBeGreaterThanOrEqual(1);
    const logged = lines[lines.length - 1];
    expect(logged.raw.includes(secret), 'the query-string key is in the nginx log').toBe(false);
    expect(logged.json.httpRequest.requestUrl).toBe(`${UNGATED}?api_key=[REDACTED]&a=1&APIKEY=[REDACTED]`);
  });
});
