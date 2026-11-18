/**
 * Browser launch and the network guard for any context that loads live developers.sefaria.org.
 *
 * Guard (COMMON hard rule 2, PLAN §6.1.2), installed before the first navigation:
 * - `** /metrics-proxy/**` is aborted (ReadMe's pageview and request beacons, and the request
 *   history list).
 * - Any non-GET request to developers.sefaria.org is aborted (this also stops Cloudflare's
 *   challenge beacon).
 * - `https://try.readme.io/**` (the Try It proxy) is fulfilled from `fixtures/tryit-responses.ts`
 *   and never reaches the network.
 * - Any request to the Sefaria API (`*.sefaria.org/api/...` outside the developers host) is
 *   aborted.
 * Every blocked or fulfilled request is counted, so a capture can prove nothing escaped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Browser, BrowserContext, Route } from 'playwright';

const require = createRequire(import.meta.url);

export const LIVE_ORIGIN = 'https://developers.sefaria.org';

/** Find a Chromium headless shell that exists on this machine. */
export function resolveChromium(): string | undefined {
  const { chromium } = require('playwright');
  const env = process.env.DEVPORTAL_VISUAL_CHROMIUM;
  if (env) return env;
  const def = chromium.executablePath();
  if (def && fs.existsSync(def)) return undefined; // Playwright's own default works
  // Playwright's pinned revision is not installed: use the newest headless shell present.
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs
    .readdirSync(root)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export async function launchChromium(): Promise<Browser> {
  const { chromium } = require('playwright');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  return chromium.launch({
    executablePath: resolveChromium(),
    proxy: proxy ? { server: proxy } : undefined,
  });
}

export interface GuardLog {
  aborted: string[];
  fulfilled: string[];
}

export type TryItHandler = (route: Route) => Promise<void>;

export async function guardLiveContext(
  context: BrowserContext,
  tryIt: TryItHandler,
  extraRoutes: (route: Route) => Promise<boolean> = async () => false
): Promise<GuardLog> {
  const log: GuardLog = { aborted: [], fulfilled: [] };
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      return route.abort();
    }
    if (url.includes('/metrics-proxy/')) {
      log.aborted.push(`${req.method()} ${url}`);
      return route.abort();
    }
    if (host === 'developers.sefaria.org' && req.method() !== 'GET' && req.method() !== 'HEAD') {
      log.aborted.push(`${req.method()} ${url}`);
      return route.abort();
    }
    if (host === 'try.readme.io') {
      log.fulfilled.push(`${req.method()} ${url}`);
      return tryIt(route);
    }
    if (host.endsWith('sefaria.org') && host !== 'developers.sefaria.org' && /^\/api\//.test(new URL(url).pathname)) {
      log.aborted.push(`${req.method()} ${url}`);
      return route.abort();
    }
    if (await extraRoutes(route)) return;
    return route.fallback();
  });
  return log;
}
