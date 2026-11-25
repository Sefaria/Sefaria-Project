/**
 * Which deployment of the social surface a page loads: the configured one, or a pull request's preview.
 *
 * Social runs on Coolify like the Library Assistant (sefaria-social docs/runbooks/previews.md): the configured origins are the shared
 * dev deployment, and pull request n has a full preview at the same hosts with "n." in front (Coolify's `{{pr_id}}.{{domain}}`).
 *  1. `?social_version=<n>` on any page: pull request n's preview, remembered for the browser session (a session cookie, as
 *     `?chatbot_version=`). `?social_version=clear` forgets it.
 *  2. Otherwise the configured deployment.
 * Only where the deployment allows previews (PUBLIC_SOCIAL_PREVIEWS=1) and never in production (PUBLIC_SOCIAL_ENVIRONMENT). A preview
 * is derived from the configured origins, so it can only come from the same Coolify app; the manifest's integrity hashes still apply.
 * One surface loads per document, so a new choice takes effect on the next page load.
 *
 * @feature SHL-077
 */
import type { SocialEnv } from "~/lib/config";

export const SOCIAL_VERSION_PARAM = "social_version";
export const SOCIAL_VERSION_COOKIE = "social_version";

const asVersion = (v: string | null | undefined): string | null => (v && /^\d+$/.test(v.trim()) ? v.trim() : null);

/** What `?social_version=` asks for: a version to remember, "clear", or nothing (absent or not a number). */
export function socialVersionFromQuery(search: string): { set: string } | { clear: true } | null {
  const raw = new URLSearchParams(search).get(SOCIAL_VERSION_PARAM)?.trim();
  if (!raw) return null;
  if (raw === "clear") return { clear: true };
  const v = asVersion(raw);
  return v ? { set: v } : null;
}

/** The version this reader asked for earlier in the session (the cookie), if any. */
export function socialVersionFromCookie(cookieHeader: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${SOCIAL_VERSION_COOKIE}=([^;]*)`).exec(cookieHeader);
  return m ? asVersion(decodeURIComponent(m[1]!)) : null;
}

/** The session cookie that remembers a version (empty value and max-age 0 to forget it); Secure on https. */
export const socialVersionCookie = (version: string | null, secure = false): string =>
  `${version ? `${SOCIAL_VERSION_COOKIE}=${version}` : `${SOCIAL_VERSION_COOKIE}=; max-age=0`}; path=/; SameSite=Lax${secure ? "; Secure" : ""}`;

/** The same URL or origin with "<version>." in front of its host; "" stays "". */
function withPreviewHost(value: string, version: string): string {
  if (!value) return value;
  const u = new URL(value);
  u.hostname = `${version}.${u.hostname}`;
  // an origin stays an origin (URL adds a trailing "/" to a bare origin's href)
  return /^[a-z]+:\/\/[^/]+$/i.test(value) ? `${u.protocol}//${u.host}` : u.href;
}

/** The deployment to load for this version: the configured one unless previews are allowed here and a version was asked for. */
export function socialEnvForVersion(env: SocialEnv | undefined, version: string | null): SocialEnv | undefined {
  const v = asVersion(version);
  if (!env || !v || !env.previews || env.environment === "production" || !env.manifestUrl) return env;
  const { devEntry: _devEntry, ...rest } = env;
  return {
    ...rest,
    manifestUrl: withPreviewHost(env.manifestUrl, v),
    allowedOrigins: env.allowedOrigins.map((o) => withPreviewHost(o, v)),
    apiOrigin: withPreviewHost(env.apiOrigin, v),
    relayOrigin: withPreviewHost(env.relayOrigin, v),
  };
}

/** The address the document was first loaded with, read before the reader completes its address (which drops unknown parameters). */
const firstSearch: string | null = typeof window !== "undefined" ? window.location.search : null;
let forPage: { env: SocialEnv | undefined; result: SocialEnv | undefined } | undefined;

/**
 * This document's deployment, in the browser: applies a `?social_version=` from the first address to the session cookie once, then
 * reads the cookie. On the server (and before the browser has a document) it is the configured deployment.
 */
export function socialEnvForPage(env: SocialEnv | undefined): SocialEnv | undefined {
  if (typeof document === "undefined") return env;
  if (forPage && forPage.env === env) return forPage.result;
  const asked = firstSearch !== null ? socialVersionFromQuery(firstSearch) : null;
  if (asked && env?.previews && env.environment !== "production")
    document.cookie = socialVersionCookie("set" in asked ? asked.set : null, window.location.protocol === "https:");
  const result = socialEnvForVersion(env, socialVersionFromCookie(document.cookie));
  forPage = { env, result };
  return result;
}
