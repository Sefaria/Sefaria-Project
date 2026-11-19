// The feedback widget's requests (contract C3 `feedback-request`; C9 `/_portal/csrf`, `/_portal/feedback`). The CSRF
// token is fetched once, on the widget's first use, and reused for the page's lifetime (a 403 fetches a new one).
import type { FeedbackRequest } from '../../contracts';

export const CSRF_URL = '/_portal/csrf';
export const FEEDBACK_URL = '/_portal/feedback';
/** C3: `comment` is at most 2000 characters. */
export const COMMENT_MAX_LENGTH = 2000;

export type FeedbackResult = 'ok' | 'rate_limited' | 'error';

let tokenPromise: Promise<string> | null = null;

async function loadToken(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(CSRF_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`csrf ${response.status}`);
  const body = (await response.json()) as { csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string' || body.csrfToken === '') throw new Error('csrf token missing');
  return body.csrfToken;
}

/** The CSRF token, fetched from `/_portal/csrf` the first time it is needed. */
export function csrfToken(fetchImpl: typeof fetch = fetch, refresh = false): Promise<string> {
  if (refresh || tokenPromise === null) {
    tokenPromise = loadToken(fetchImpl).catch((error: unknown) => {
      tokenPromise = null;
      throw error;
    });
  }
  return tokenPromise;
}

/** Test hook: forget the cached token. */
export function resetCsrfTokenForTests(): void {
  tokenPromise = null;
}

/** The C3 request body: the comment trimmed to the contract's limit. */
export function feedbackBody(path: string, helpful: boolean, comment: string): FeedbackRequest {
  return { path, helpful, comment: comment.slice(0, COMMENT_MAX_LENGTH) };
}

async function post(fetchImpl: typeof fetch, body: FeedbackRequest, token: string): Promise<Response> {
  return fetchImpl(FEEDBACK_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRFToken': token },
    body: JSON.stringify(body),
  });
}

/** POSTs the vote. 201 is success; a 403 (stale token) is retried once with a fresh token. */
export async function sendFeedback(body: FeedbackRequest, fetchImpl: typeof fetch = fetch): Promise<FeedbackResult> {
  try {
    let response = await post(fetchImpl, body, await csrfToken(fetchImpl));
    if (response.status === 403) response = await post(fetchImpl, body, await csrfToken(fetchImpl, true));
    if (response.status === 201 || response.ok) return 'ok';
    if (response.status === 429) return 'rate_limited';
    return 'error';
  } catch {
    return 'error';
  }
}
