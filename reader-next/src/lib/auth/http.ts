/**
 * The one fetch helper for writes to Django (auth, and later notes, sheets, feedback): same origin, the session cookie, and
 * `X-CSRFToken`. Requests go to the page's own origin on purpose — sign-in only works when this client is served on the same site
 * as Django (docs/DEPLOYMENT.md), so there is no cross-origin variant. Ported from postRequest/postJson/postForm in
 * static/js/auth/utils.js (same return shape).
 *
 * @feature ACC-009 Email and password login
 */
import { ensureCsrfToken } from "./csrf";

export interface PostResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  networkError: boolean;
}

/** An absolute URL on the page's own origin (fetch in some environments refuses a bare path). */
export const sameOrigin = (path: string) => (typeof window !== "undefined" ? new URL(path, window.location.href).href : path);

async function postRequest(url: string, body: string, contentType: string): Promise<PostResult> {
  try {
    const csrf = await ensureCsrfToken();
    const res = await fetch(sameOrigin(url), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": contentType, "X-CSRFToken": csrf },
      body,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data: data ?? {}, networkError: false };
  } catch {
    return { ok: false, status: 0, data: {}, networkError: true };
  }
}

/** POST a JSON body; tolerates a non-JSON answer (data is then {}). */
export const postJson = (url: string, body: unknown) => postRequest(url, JSON.stringify(body), "application/json");

/** POST a form-encoded body. */
export const postForm = (url: string, body: URLSearchParams) => postRequest(url, body.toString(), "application/x-www-form-urlencoded");
