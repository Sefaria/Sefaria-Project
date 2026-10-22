import { APIRequestContext, request as playwrightRequest } from '@playwright/test';
import {
  CAULDRON_HOST, LOCAL_PORTS, ManifestKey, TargetName, assertAllowedUrl, findKey, maskSecrets,
} from './env';
import { classifyResponse, withInfraRetry } from './infra';

/**
 * Node-side calls through the gateway. Browser pages resolve *.gateway.test with a launch arg;
 * Node does not, so local calls go to 127.0.0.1 with an explicit Host header (CONTRACT.md §2).
 */

export type HostName = 'www' | 'voices' | 'echo' | 'direct' | 'flagoff' | 'bare';
export type Listener = 'strip' | 'nostrip' | 'nginx';

export type KeyRef = { suite: string; name: string };

export type GatewayCall = {
  path: string;
  method?: string;
  /** A manifest key, a literal header value (synthetic bad keys), or omitted for no header. */
  key?: KeyRef | string;
  origin?: string;
  authorization?: string;
  host?: HostName;
  listener?: Listener;
  headers?: Record<string, string>;
  data?: unknown;
  /** Defaults to 0: a gateway test asserts the first response, not where it leads. */
  maxRedirects?: number;
  /** Defaults to true. Off for tests that assert on a 503 itself. */
  retryInfra?: boolean;
};

export type GatewayResult = {
  status: number;
  /** The JSON `code` of a gateway or Django error body, when there is one. */
  code?: string;
  error?: string;
  help?: string;
  headers: Record<string, string>;
  body: string;
  json?: any;
  /** Request headers as the echo upstream received them (host `echo` only), secrets masked. */
  echoHeaders?: Record<string, string>;
};

const HOSTS: Record<HostName, string> = {
  www: 'www.gateway.test',
  voices: 'voices.gateway.test',
  echo: 'echo.gateway.test',
  direct: 'direct.gateway.test',
  flagoff: 'flagoff.gateway.test',
  bare: 'gateway.test',
};

const LISTENER_PORTS: Record<Listener, number> = {
  strip: LOCAL_PORTS.envoyStrip,
  nostrip: LOCAL_PORTS.envoyNoStrip,
  nginx: LOCAL_PORTS.nginxDirect,
};

export function keyValue(key: KeyRef | string): string {
  return typeof key === 'string' ? key : findKey(key.suite, key.name).value;
}

export function manifestKey(key: KeyRef): ManifestKey {
  return findKey(key.suite, key.name);
}

/** Where a call goes and which Host header it carries, per target. */
export function addressFor(target: TargetName, host: HostName = 'www', listener: Listener = 'strip') {
  if (target === 'cauldron') {
    if (host !== 'www' || listener !== 'strip') {
      throw new Error(`Host ${host} / listener ${listener} exists only on the local stack; skip on the cauldron.`);
    }
    return { url: `https://${CAULDRON_HOST}`, hostHeader: undefined as string | undefined };
  }
  const port = LISTENER_PORTS[listener];
  return { url: `http://127.0.0.1:${port}`, hostHeader: `${HOSTS[host]}:${port}` };
}

/** The origin a browser page on the given host would send, for building Origin headers. */
export function browserOrigin(target: TargetName, host: HostName = 'www'): string {
  if (target === 'cauldron') return `https://${CAULDRON_HOST}`;
  return `http://${HOSTS[host]}:${LOCAL_PORTS.envoyStrip}`;
}

function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}

function maskHeaderMap(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = k === 'x-api-key' || k === 'authorization' ? maskSecrets(v).replace(/^(Bearer\s+).+$/i, '$1…') : maskSecrets(v);
  }
  return out;
}

export class Gateway {
  constructor(readonly target: TargetName, private readonly ctx: APIRequestContext) {}

  static async create(target: TargetName): Promise<Gateway> {
    const ctx = await playwrightRequest.newContext({
      ignoreHTTPSErrors: target === 'cauldron',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    return new Gateway(target, ctx);
  }

  async dispose() {
    await this.ctx.dispose();
  }

  async call(opts: GatewayCall): Promise<GatewayResult> {
    const { url, hostHeader } = addressFor(this.target, opts.host, opts.listener);
    const full = url + opts.path;
    assertAllowedUrl(full, 'api');
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (hostHeader) headers['Host'] = hostHeader;
    if (opts.key !== undefined) headers['x-api-key'] = keyValue(opts.key);
    if (opts.origin !== undefined) headers['Origin'] = opts.origin;
    if (opts.authorization !== undefined) headers['Authorization'] = opts.authorization;

    const send = async (): Promise<GatewayResult> => {
      const response = await this.ctx.fetch(full, {
        method: opts.method || 'GET',
        headers,
        data: opts.data as any,
        maxRedirects: opts.maxRedirects ?? 0,
        failOnStatusCode: false,
      });
      const body = await response.text();
      const result: GatewayResult = { status: response.status(), headers: lowerHeaders(response.headers()), body };
      try {
        result.json = JSON.parse(body);
      } catch {
        /* not JSON */
      }
      if (result.json && typeof result.json === 'object') {
        result.code = result.json.code;
        result.error = result.json.error;
        result.help = result.json.help;
        const echoed = result.json?.request?.headers;
        if (opts.host === 'echo' && echoed && typeof echoed === 'object') {
          result.echoHeaders = maskHeaderMap(lowerHeaders(echoed));
          result.body = maskSecrets(body);
          result.json = JSON.parse(result.body);
        }
      }
      return result;
    };

    if (opts.retryInfra === false) return send();
    return withInfraRetry(send, r => classifyResponse(r.status, r.body));
  }

  get(path: string, opts: Omit<GatewayCall, 'path' | 'method'> = {}) {
    return this.call({ ...opts, path, method: 'GET' });
  }

  post(path: string, opts: Omit<GatewayCall, 'path' | 'method'> = {}) {
    return this.call({ ...opts, path, method: 'POST' });
  }

  options(path: string, opts: Omit<GatewayCall, 'path' | 'method'> = {}) {
    return this.call({ ...opts, path, method: 'OPTIONS' });
  }
}

/** One-line description of a call result that is safe to print: no key values. */
export function describe(result: GatewayResult): string {
  return maskSecrets(`${result.status} code=${result.code ?? '-'} body=${result.body.slice(0, 300)}`);
}
