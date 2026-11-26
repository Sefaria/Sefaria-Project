// Recent Requests (PLAN §2.12, C10 `try_it.recent_requests`): per browser, in localStorage under
// `dp:recent-requests:v1`, at most 50 entries of time, status, method, path and operationId. Never a body, a query
// value or a key: `path` is the operation's path template, not the filled-in URL.

export const RECENT_REQUESTS_KEY = 'dp:recent-requests:v1';
export const RECENT_REQUESTS_MAX = 50;

export interface RecentRequest {
  /** ISO time the response arrived. */
  time: string;
  /** HTTP status, or 0 when the request failed without a response. */
  status: number;
  method: string;
  /** Path template, e.g. `/api/v3/texts/{tref}`. */
  path: string;
  operationId: string;
}

const FIELDS = ['time', 'status', 'method', 'path', 'operationId'] as const;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is RecentRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.time === 'string' &&
    typeof v.status === 'number' &&
    typeof v.method === 'string' &&
    typeof v.path === 'string' &&
    typeof v.operationId === 'string'
  );
}

/** Every stored entry, newest first; a malformed store reads as empty. */
export function readRecentRequests(): RecentRequest[] {
  const store = storage();
  if (store === null) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(RECENT_REQUESTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, RECENT_REQUESTS_MAX) : [];
  } catch {
    return [];
  }
}

/** Stores `entry` first, keeping only the five allowed fields and at most 50 entries. Returns the new list. */
export function addRecentRequest(entry: RecentRequest): RecentRequest[] {
  const clean = Object.fromEntries(FIELDS.map((f) => [f, entry[f]])) as unknown as RecentRequest;
  const next = [clean, ...readRecentRequests()].slice(0, RECENT_REQUESTS_MAX);
  try {
    storage()?.setItem(RECENT_REQUESTS_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the list still shows for this page view.
  }
  return next;
}

/** "Less than a minute ago", "5 minutes ago"… as live's request log shows the time. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'Less than a minute ago';
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, 'year'],
    [60 * 60 * 24 * 30, 'month'],
    [60 * 60 * 24, 'day'],
    [60 * 60, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, unit] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  }
  return 'Less than a minute ago';
}
