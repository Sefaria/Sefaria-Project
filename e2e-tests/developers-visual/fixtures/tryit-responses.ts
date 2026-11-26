/**
 * Recorded Try It responses (PLAN.md §6.1.2). Both adapters fulfil Try It from these, so no
 * capture or parity run sends a request to the Sefaria API.
 *
 * Provenance. The research network log
 * (`docs/dev-portal/research/reference/data/interaction-network-log.json`) recorded the status,
 * the request and the response headers of the three calls, but not the response bodies:
 * - `v3-genesis-200`: status and headers from log entry 19
 *   (`GET /api/v3/texts/Genesis%201%3A1`, 200). Body: NOT recorded. We use the 200 example
 *   "Esther 1.1" of `docs/openAPI.json` (a real v3 response for the same MAM version), so the
 *   code viewer shows the same first lines the research screenshot `v3_tryit_success_1440` shows
 *   (`versions[0]` of MAM). Lower lines differ from what live returned for Genesis 1:1; both sides
 *   render this body, so the comparison is unaffected.
 * - `v3-notabook-404`: the 404 for `Notabook 99`. The entry is not in the log; the body is the one
 *   REFERENCE_SPEC.md §2.1 quotes, the headers are entry 19's with the status changed.
 * - `find-refs-202`: status and headers from log entry 31 (`POST /api/find-refs`, 202). Body: the
 *   task id recorded in `interaction-notes.txt` ("fr resp").
 * Hop-by-hop and encoding headers (`connection`, `transfer-encoding`, `content-encoding`,
 * `content-length`) are dropped because the body is served uncompressed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Route } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');

export type TryItFixtureId = 'v3-genesis-200' | 'v3-notabook-404' | 'find-refs-202';

export interface TryItFixture {
  id: TryItFixtureId;
  /** Upstream method and path the request must match. */
  method: 'GET' | 'POST';
  pathPattern: RegExp;
  status: number;
  headers: Record<string, string>;
  body: string;
}

const DROP = new Set(['connection', 'transfer-encoding', 'content-encoding', 'content-length']);

function loggedHeaders(index: number): Record<string, string> {
  const log = JSON.parse(
    fs.readFileSync(path.join(repo, 'docs/dev-portal/research/reference/data/interaction-network-log.json'), 'utf8')
  );
  const h: Record<string, string> = log[index].respHeaders;
  return Object.fromEntries(Object.entries(h).filter(([k]) => !DROP.has(k.toLowerCase())));
}

function esther11Example(): unknown {
  const spec = JSON.parse(fs.readFileSync(path.join(repo, 'docs/openAPI.json'), 'utf8'));
  return spec.paths['/api/v3/texts/{tref}'].get.responses['200'].content['application/json'].examples['Esther 1.1']
    .value;
}

let cache: Record<TryItFixtureId, TryItFixture> | null = null;

export function tryItFixtures(): Record<TryItFixtureId, TryItFixture> {
  if (cache) return cache;
  const genesisHeaders = loggedHeaders(19);
  cache = {
    'v3-genesis-200': {
      id: 'v3-genesis-200',
      method: 'GET',
      pathPattern: /\/api\/v3\/texts\/Genesis(%20| )1(%3A|:)1$/,
      status: 200,
      headers: genesisHeaders,
      body: JSON.stringify(esther11Example()),
    },
    'v3-notabook-404': {
      id: 'v3-notabook-404',
      method: 'GET',
      pathPattern: /\/api\/v3\/texts\/Notabook(%20| )99$/,
      status: 404,
      headers: { ...genesisHeaders, url: '/api/v3/texts/Notabook%2099' },
      body: JSON.stringify({ error: 'Could not find title in reference: Notabook 99' }),
    },
    'find-refs-202': {
      id: 'find-refs-202',
      method: 'POST',
      pathPattern: /\/api\/find-refs$/,
      status: 202,
      headers: loggedHeaders(31),
      body: JSON.stringify({ task_id: '752d3ce7-d4c7-4921-88d0-270139ebe22d' }),
    },
  };
  return cache;
}

/**
 * Controls Try It fulfilment for one page. `arm()` before clicking Try It; with `hold`, the
 * response waits until `release()` (R13, the loading state).
 */
export class TryItController {
  private armed: { fixture: TryItFixtureId; hold: boolean } | null = null;
  private releaseFn: (() => void) | null = null;
  private pending: Promise<void> | null = null;
  readonly served: string[] = [];

  arm(fixture: TryItFixtureId, hold = false): void {
    this.armed = { fixture, hold };
    this.pending = hold ? new Promise<void>((resolve) => (this.releaseFn = resolve)) : null;
  }

  release(): void {
    this.releaseFn?.();
    this.releaseFn = null;
  }

  /** Route handler: fulfils the armed fixture, aborts anything else. */
  handle = async (route: Route): Promise<void> => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, PUT, HEAD, OPTIONS',
          'access-control-allow-headers': '*',
        },
      });
      return;
    }
    if (!this.armed) {
      await route.abort();
      return;
    }
    const fx = tryItFixtures()[this.armed.fixture];
    const upstream = req.url().replace(/^https:\/\/try\.readme\.io\//, '');
    if (req.method() !== fx.method || !fx.pathPattern.test(new URL(upstream).pathname)) {
      throw new Error(`Try It request ${req.method()} ${upstream} does not match fixture ${fx.id}`);
    }
    if (this.pending) await this.pending;
    this.served.push(fx.id);
    await route.fulfill({ status: fx.status, headers: fx.headers, body: fx.body });
  };
}

/** Convenience for scripts that only need one fixture, unheld. */
export function tryItRoute(opts: { fixture: TryItFixtureId }): (route: Route) => Promise<void> {
  const c = new TryItController();
  c.arm(opts.fixture);
  return c.handle;
}
