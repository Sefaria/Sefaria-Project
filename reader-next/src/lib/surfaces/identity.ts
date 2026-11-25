/**
 * host.viewer.identityToken(): a short-lived token from Django that tells the social server who the reader is
 * (`POST /api/social/token`: session cookie and CSRF, through src/lib/auth/http.ts; answers `{ token, expires_at }`).
 * Kept in memory only — never in storage, a URL or a log — and reused until 60 seconds before it expires; concurrent callers share
 * one request. Rejects when nobody is signed in (or Django says so: 401/403), and forgets the token when the signed-in reader changes.
 *
 * @feature SHL-078 SurfaceHost v1
 */
import type { PostResult } from "~/lib/auth/http";

export const TOKEN_PATH = "/api/social/token";
/** Ask again this long before the token expires. */
export const REFRESH_MARGIN_MS = 60_000;

export class SignedOutError extends Error {
  constructor() {
    super("signed out");
    this.name = "SignedOutError";
  }
}

/** `expires_at` as Django may write it: epoch seconds, epoch milliseconds, or an ISO date. NaN when unreadable. */
export function expiryMs(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") return /^\d+(\.\d+)?$/.test(v) ? expiryMs(Number(v)) : Date.parse(v);
  return NaN;
}

export interface TokenSourceDeps {
  post: (url: string, body: unknown) => Promise<PostResult>;
  viewerId: () => number | null;
  now?: () => number;
}

export function createIdentityTokenSource({ post, viewerId, now = Date.now }: TokenSourceDeps): () => Promise<string> {
  let cached: { token: string; expires: number; viewer: number } | null = null;
  let inflight: { promise: Promise<string>; viewer: number } | null = null;
  return () => {
    const viewer = viewerId();
    if (viewer === null) {
      cached = null;
      return Promise.reject(new SignedOutError());
    }
    if (cached && cached.viewer === viewer && cached.expires - REFRESH_MARGIN_MS > now()) return Promise.resolve(cached.token);
    if (inflight && inflight.viewer === viewer) return inflight.promise;
    const promise = post(TOKEN_PATH, {})
      .then((r) => {
        if (r.status === 401 || r.status === 403) throw new SignedOutError();
        const token = r.data.token;
        const expires = expiryMs(r.data.expires_at);
        if (!r.ok || typeof token !== "string" || !token || !Number.isFinite(expires)) throw new Error(`identity token: ${r.networkError ? "network error" : `HTTP ${r.status}`}`);
        // a token already inside the refresh margin is still returned once, but not kept
        cached = expires - REFRESH_MARGIN_MS > now() ? { token, expires, viewer } : null;
        return token;
      })
      .finally(() => {
        if (inflight?.promise === promise) inflight = null;
      });
    inflight = { promise, viewer };
    return promise;
  };
}
