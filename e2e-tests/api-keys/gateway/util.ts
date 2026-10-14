import http from 'http';
import https from 'https';
import path from 'path';
import { spawnSync } from 'child_process';
import { CAULDRON_HOST, CAULDRON_KUBE_CONTEXT, LOCAL_PORTS, REPO_ROOT, TargetName, maskSecrets } from '../env';

/**
 * Requests the Playwright request context cannot make: the path is sent byte for byte (no URL
 * normalisation of `/./`, `//` or bad escapes), and a header may repeat.
 */

export const GATED = '/api/knn-search';
export const UNGATED = '/api/v3/texts/Genesis.1.1';
export const STACK_PROJECT = 'sefaria-apikeys-stack';
export const AUTHSVC_CONTAINER = `${STACK_PROJECT}-authsvc-1`;
export const PG_CONTAINER = `${STACK_PROJECT}-pg-1`;
export const A_SERIES = path.join(REPO_ROOT, 'auth-service', 'dev', 'local-stack', 'scenarios', 'a-series.sh');
/** The private Envoy with KEEP_UNCHANGED for escaped slashes that a-series.sh starts for N-A1. */
export const KEEPUNCHANGED_PORT = 10090;

export type RawHost = 'www' | 'voices' | 'echo' | 'bare';

export type RawCall = {
  target: TargetName;
  path: string;
  method?: string;
  host?: RawHost;
  /** Local only: the listener port (10080 strip, 10081 no strip, or the private KEEP_UNCHANGED Envoy). */
  port?: number;
  /** Cauldron only: plain http:// instead of https:// (N-A2). */
  plainHttp?: boolean;
  headers?: Record<string, string | string[]>;
  body?: string;
  timeoutMs?: number;
};

export type RawResult = {
  status: number;
  headers: Record<string, string>;
  /** Secrets masked. */
  body: string;
  json?: any;
  code?: string;
  error?: string;
  help?: string;
  /** For host `echo`: what the upstream received. */
  echo?: { headers: Record<string, string>; originalUrl: string };
  elapsedMs: number;
};

const LOCAL_HOSTS: Record<RawHost, string> = {
  www: 'www.gateway.test',
  voices: 'voices.gateway.test',
  echo: 'echo.gateway.test',
  bare: 'gateway.test',
};

const CAULDRON_ROOT = CAULDRON_HOST.replace(/^www\./, '');
const CAULDRON_HOSTS: Partial<Record<RawHost, string>> = {
  www: CAULDRON_HOST,
  voices: `voices.${CAULDRON_ROOT}`,
  bare: CAULDRON_ROOT,
};

export function rawRequest(call: RawCall): Promise<RawResult> {
  const host = call.host ?? 'www';
  const headers: Record<string, string | string[]> = { ...(call.headers || {}) };
  let options: http.RequestOptions;
  let client: typeof http | typeof https;
  if (call.target === 'local') {
    const port = call.port ?? LOCAL_PORTS.envoyStrip;
    if (![LOCAL_PORTS.envoyStrip, LOCAL_PORTS.envoyNoStrip, KEEPUNCHANGED_PORT].includes(port as any)) {
      throw new Error(`Port ${port} is not a gateway listener of the local stack.`);
    }
    headers['Host'] = `${LOCAL_HOSTS[host]}:${port}`;
    options = { host: '127.0.0.1', port, path: call.path, method: call.method || 'GET', headers };
    client = http;
  } else {
    const hostname = CAULDRON_HOSTS[host];
    if (!hostname) throw new Error(`Host ${host} does not exist on the cauldron.`);
    options = {
      host: hostname, servername: hostname, port: call.plainHttp ? 80 : 443, path: call.path,
      method: call.method || 'GET', headers, rejectUnauthorized: false,
    } as https.RequestOptions;
    client = call.plainHttp ? http : https;
  }
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = client.request(options, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) flat[k] = Array.isArray(v) ? v.join(', ') : String(v);
        const body = maskSecrets(Buffer.concat(chunks).toString('utf-8'));
        const result: RawResult = { status: res.statusCode || 0, headers: flat, body, elapsedMs: Date.now() - started };
        try { result.json = JSON.parse(body); } catch { /* not JSON */ }
        if (result.json && typeof result.json === 'object') {
          result.code = result.json.code;
          result.error = result.json.error;
          result.help = result.json.help;
          if (host === 'echo' && result.json.request?.headers) {
            result.echo = { headers: result.json.request.headers, originalUrl: result.json.http?.originalUrl };
          }
        }
        resolve(result);
      });
    });
    req.setTimeout(call.timeoutMs ?? 30000, () => req.destroy(new Error(`timeout after ${call.timeoutMs ?? 30000} ms`)));
    req.on('error', reject);
    if (call.body !== undefined) req.write(call.body);
    req.end();
  });
}

/** A one-line, secret-free summary for assertion messages. */
export function summary(r: RawResult): string {
  return `${r.status} code=${r.code ?? '-'} body=${r.body.slice(0, 240).replace(/\s+/g, ' ')}`;
}

/** The three headers the gateway stamps, as the echo upstream received them. */
export function stamped(r: RawResult) {
  const h = r.echo?.headers || {};
  return { tier: h['x-sefaria-tier'], project: h['x-sefaria-project'], result: h['x-sefaria-auth-result'] };
}

/** True when the response came from the gateway itself: Envoy never contacted an upstream. */
export function answeredByGateway(r: RawResult): boolean {
  return r.headers['x-envoy-upstream-service-time'] === undefined;
}

export function sh(cmd: string, args: string[], input?: string): { status: number; stdout: string; stderr: string } {
  const out = spawnSync(cmd, args, { encoding: 'utf-8', input, timeout: 120000 });
  return { status: out.status ?? -1, stdout: out.stdout || '', stderr: out.stderr || '' };
}

/** Auth-service log lines since a timestamp (local stack only), secrets masked. */
export function authsvcLogSince(since: Date): string[] {
  const out = sh('docker', ['logs', '--since', since.toISOString(), AUTHSVC_CONTAINER]);
  return maskSecrets(out.stdout + out.stderr).split('\n').filter(Boolean);
}

/** Raw text of an unmasked log search: does any line since `since` contain `needle`? (Never print the result.) */
export function authsvcLogContains(since: Date, needle: string): boolean {
  const out = sh('docker', ['logs', '--since', since.toISOString(), AUTHSVC_CONTAINER]);
  return (out.stdout + out.stderr).includes(needle);
}

/** Runs SQL as the local stack's superuser. Local fixture rows only. */
export function localPsql(sql: string): string {
  const out = sh('docker', ['exec', '-i', PG_CONTAINER, 'psql', '-U', 'postgres', '-d', 'sefaria_auth', '-At', '-v', 'ON_ERROR_STOP=1'], sql);
  if (out.status !== 0) throw new Error(`psql failed: ${out.stderr.trim()}`);
  return out.stdout.trim();
}

/** A Prometheus counter from the local auth service's /metrics, summed over series matching all labels. */
export async function authsvcCounter(name: string, labels: Record<string, string>): Promise<number> {
  const text = await new Promise<string>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: LOCAL_PORTS.authHttp, path: '/metrics' }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
  let total = 0;
  for (const line of text.split('\n')) {
    if (!line.startsWith(name + '{')) continue;
    const labelText = line.slice(name.length + 1, line.indexOf('}'));
    if (Object.entries(labels).every(([k, v]) => labelText.includes(`${k}="${v}"`))) {
      total += Number(line.slice(line.lastIndexOf(' ') + 1));
    }
  }
  return total;
}

export function kubectlReadOnly(args: string[]): { status: number; stdout: string; stderr: string } {
  const verb = args[0];
  if (!['get', 'logs'].includes(verb)) throw new Error(`kubectl ${verb} is not a read-only call.`);
  return sh('kubectl', ['--context', CAULDRON_KUBE_CONTEXT, ...args]);
}

/** A key-shaped value nobody holds, unique per call so log lines can be found. */
export function unknownKey(prefix = 'sfr_'): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz23456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return prefix + s;
}
