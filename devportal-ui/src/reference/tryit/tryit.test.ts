// Try It transport (S-1 shape, C10 `try_it.fetch_options`) and Recent Requests storage (S-13).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addRecentRequest,
  readRecentRequests,
  RECENT_REQUESTS_KEY,
  RECENT_REQUESTS_MAX,
  relativeTime,
  type RecentRequest,
} from './recent';
import { formatBody, sendTryIt, TRY_IT_FETCH_OPTIONS } from './send';

const security = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../devportal/contracts/security.json'), 'utf8')
) as {
  try_it: {
    fetch_options: Record<string, string>;
    recent_requests: { key: string; max_entries: number; fields: string[] };
  };
};

describe('sendTryIt (S-1)', () => {
  it('calls fetch with exactly the C10 options: no credentials, CORS, no cache, no referrer', async () => {
    const calls: [string, RequestInit][] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const result = await sendTryIt(
      { url: 'https://www.sefaria.org/api/calendars', method: 'GET', headers: { accept: 'application/json' } },
      fake
    );
    expect(calls).toHaveLength(1);
    const [, init] = calls[0]!;
    expect({
      credentials: init.credentials,
      mode: init.mode,
      cache: init.cache,
      referrerPolicy: init.referrerPolicy,
    }).toEqual(security.try_it.fetch_options);
    expect(TRY_IT_FETCH_OPTIONS).toEqual(security.try_it.fetch_options);
    expect(init.headers).toEqual({ accept: 'application/json' });
    expect(result).toMatchObject({ ok: true, status: 200, bodyText: '{"ok":true}', contentType: 'application/json' });
  });

  it('reports a request that fails without a response as status 0', async () => {
    const fake = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await sendTryIt({ url: 'https://www.sefaria.org/api/x', method: 'GET', headers: {} }, fake)).toEqual({
      ok: false,
      status: 0,
      message: 'Failed to fetch',
    });
  });

  it('pretty-prints JSON and leaves other bodies unchanged', () => {
    expect(formatBody('{"a":1}', 'application/json')).toBe('{\n  "a": 1\n}');
    expect(formatBody('<b>x</b>', 'text/html')).toBe('<b>x</b>');
  });
});

describe('Recent Requests storage (S-13)', () => {
  beforeEach(() => window.localStorage.clear());

  const entry = (i: number): RecentRequest => ({
    time: new Date(Date.UTC(2026, 10, 18, 10, 0, i)).toISOString(),
    status: 200,
    method: 'GET',
    path: '/api/v3/texts/{tref}',
    operationId: 'get-v3-texts',
  });

  it('uses the C10 key and limit', () => {
    expect(RECENT_REQUESTS_KEY).toBe(security.try_it.recent_requests.key);
    expect(RECENT_REQUESTS_MAX).toBe(security.try_it.recent_requests.max_entries);
  });

  it('stores only time, status, method, path and operationId, newest first, at most 50', () => {
    for (let i = 0; i < 60; i += 1) {
      addRecentRequest({
        ...entry(i),
        body: 'secret body',
        url: '/api/v3/texts/secret?q=value',
        apiKey: 'k',
      } as RecentRequest);
    }
    const stored = JSON.parse(window.localStorage.getItem(RECENT_REQUESTS_KEY)!) as Record<string, unknown>[];
    expect(stored).toHaveLength(50);
    for (const row of stored)
      expect(Object.keys(row).sort()).toEqual([...security.try_it.recent_requests.fields].sort());
    expect(window.localStorage.getItem(RECENT_REQUESTS_KEY)).not.toMatch(/secret|value|apiKey/);
    expect(readRecentRequests()[0]!.time).toBe(entry(59).time);
  });

  it('reads a corrupt store as empty', () => {
    window.localStorage.setItem(RECENT_REQUESTS_KEY, '{not json');
    expect(readRecentRequests()).toEqual([]);
    window.localStorage.setItem(RECENT_REQUESTS_KEY, '[{"time":1}]');
    expect(readRecentRequests()).toEqual([]);
  });

  it('words times as live does', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    expect(relativeTime(new Date(now - 20_000).toISOString(), now)).toBe('Less than a minute ago');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 minutes ago');
    expect(relativeTime(new Date(now - 3600_000).toISOString(), now)).toBe('1 hour ago');
  });
});
