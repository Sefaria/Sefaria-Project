import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import tls from 'tls';
import { execFileSync } from 'child_process';
import { BrowserContext, Page, Response } from '@playwright/test';
import { baseURLFor, CAULDRON_HOST, LOCAL_PORTS, TargetName, maskSecrets } from '../env';

/**
 * Browser helpers for the callers suites: third-party pages served with page.route, fetches made
 * from inside them, and a watcher for gateway refusals on the target's own hosts.
 */

export const SITE_A = 'https://site-a.example.com';
export const SITE_B = 'https://site-b.example.com';

/**
 * Launch args the local target needs (CONTRACT.md §2). Chromium's private-network checks are off:
 * a third-party site calling the real Sefaria crosses no address-space boundary, but locally
 * *.gateway.test resolves to loopback and Chromium would block the call before CORS is looked at.
 */
export const LOCAL_LAUNCH_ARGS = [
  '--host-resolver-rules=MAP *.gateway.test 127.0.0.1',
  `--explicitly-allowed-ports=${LOCAL_PORTS.envoyStrip},${LOCAL_PORTS.envoyNoStrip}`,
  '--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,' +
    'PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults',
];

/**
 * A TLS front for the local gateway listener. Third-party sites are https, and a browser blocks
 * an https page's fetch to plain http (mixed content) before CORS is evaluated. This terminates
 * TLS with a throwaway self-signed certificate and pipes bytes unchanged to Envoy :10080, so the
 * Host header, Origin, preflight and every response header are the gateway's own.
 */
export class TlsFront {
  private constructor(private readonly server: tls.Server, private readonly dir: string, readonly port: number) {}

  static async start(): Promise<TlsFront> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apikeys-tlsfront-'));
    const keyFile = path.join(dir, 'key.pem');
    const certFile = path.join(dir, 'cert.pem');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=www.gateway.test', '-days', '1',
      '-keyout', keyFile, '-out', certFile,
    ], { stdio: 'ignore' });
    const server = tls.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, socket => {
      const upstream = net.connect(LOCAL_PORTS.envoyStrip, '127.0.0.1');
      socket.pipe(upstream).pipe(socket);
      upstream.on('error', () => socket.destroy());
      socket.on('error', () => upstream.destroy());
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return new TlsFront(server, dir, (server.address() as net.AddressInfo).port);
  }

  origin(host = 'www.gateway.test'): string {
    return `https://${host}:${this.port}`;
  }

  async stop() {
    await new Promise<void>(resolve => this.server.close(() => resolve()));
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

/** Where a browser on a third-party https page sends API calls. */
export function apiBase(target: TargetName, front?: TlsFront): string {
  if (target === 'local') {
    if (!front) throw new Error('The local target needs a TlsFront for calls from https pages.');
    return front.origin();
  }
  return baseURLFor(target);
}

export function voicesBase(target: TargetName): string {
  if (target === 'cauldron') return `https://${CAULDRON_HOST.replace(/^www\./, 'voices.')}`;
  return `http://voices.gateway.test:${LOCAL_PORTS.envoyStrip}`;
}

/** True for a URL on one of the target's own hosts (not a third-party script or font). */
export function isTargetUrl(target: TargetName, url: string): boolean {
  const host = new URL(url).hostname;
  if (target === 'local') return /(^|\.)gateway\.test$/.test(host);
  return host.endsWith(CAULDRON_HOST.replace(/^www\./, ''));
}

/**
 * Opens a page whose document comes from `origin`, so scripts in it run with that Origin. Nothing
 * is fetched from the origin itself: the document is served by a route, and every route is removed
 * once it has loaded. While any route is active, Playwright answers CORS preflights itself with
 * permissive headers, which would hide exactly the gaps these tests look for.
 */
export async function openForeignPage(
  context: BrowserContext,
  origin: string,
  html = '<!doctype html><title>foreign</title><body></body>',
): Promise<Page> {
  await context.route(`${origin}/**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const page = await context.newPage();
  await page.goto(`${origin}/`);
  await context.unrouteAll({ behavior: 'wait' });
  return page;
}

export type PageFetchResult = {
  /** The browser blocked the response (CORS, mixed content, network): the page cannot read anything. */
  blocked: boolean;
  error?: string;
  status?: number;
  body?: string;
  json?: any;
  allowOrigin?: string | null;
  /** What the browser said in the console while the fetch ran (the CORS reason, when blocked). */
  console?: string[];
};

/** A cross-origin fetch from inside the page, as a third-party site's script would make it. */
export async function fetchFromPage(
  page: Page,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<PageFetchResult> {
  const messages: string[] = [];
  const onConsole = (m: { text(): string }) => messages.push(maskSecrets(m.text()));
  page.on('console', onConsole);
  const result: PageFetchResult = await page.evaluate(async ({ url, init }) => {
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'omit', ...init });
      const body = await response.text();
      let json: any;
      try { json = JSON.parse(body); } catch { json = undefined; }
      return {
        blocked: false,
        status: response.status,
        body: body.slice(0, 2000),
        json,
        allowOrigin: response.headers.get('access-control-allow-origin'),
      };
    } catch (e: any) {
      return { blocked: true, error: String(e && e.message || e) };
    }
  }, { url, init });
  await page.waitForTimeout(100);
  page.off('console', onConsole);
  if (result.body) result.body = maskSecrets(result.body);
  result.console = messages;
  return result;
}

export function describeFetch(r: PageFetchResult): string {
  if (r.blocked) return `blocked by the browser: ${r.error} | ${(r.console || []).join(' | ').slice(0, 400)}`;
  return maskSecrets(`${r.status} ${String(r.body).slice(0, 200)}`);
}

export type Refusal = { url: string; status: number; code?: string };

/** Records every 401/403 a page receives from the target's own hosts. */
export function watchRefusals(page: Page, target: TargetName): Refusal[] {
  const refusals: Refusal[] = [];
  page.on('response', async (response: Response) => {
    const status = response.status();
    if (status !== 401 && status !== 403) return;
    const url = response.url();
    if (!isTargetUrl(target, url)) return;
    let code: string | undefined;
    try { code = (await response.json())?.code; } catch { /* not JSON */ }
    refusals.push({ url: maskSecrets(url), status, code });
  });
  return refusals;
}
