/**
 * Pure helpers of the auth page, ported from the old client's static/js/auth/utils.js (same names, same behaviour).
 *
 * @feature ACC-007 Auth routes and in-app auth page mounting
 * @feature ACC-008 Auth page with choose / email views
 * @feature RTE-052 Other page params (login/next …)
 */
import { isLocalPath } from "~/lib/html/local-path";

/**
 * Google sign-in (the button's popup and One Tap) posts `{id_token}` here (master's sso/urls.py `google_web`, in place of allauth's stock
 * provider-token endpoint, which had no `outcome` for the auth funnel): 200 `{outcome}`, 400 `{error}` (CODE_REVIEW R-37).
 */
export const GOOGLE_CALLBACK_URL = "/api/auth/google/callback";

export type AuthFlow = "login" | "register" | "reset";

/** What a failed request shows in the error banner. `message` is a string key (auth.*) or a server message in plain words. */
export interface AuthError {
  message?: string;
  code?: string;
  providers?: string[];
  linkText?: string;
}

export type FieldErrors = Record<string, string | null | undefined>;

export function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Polls `check` every 100ms (80 tries, 8s) and calls `cb` once it passes; returns a cancel function. For third-party SDKs that load async. */
export function whenReady(check: () => unknown, cb: () => void): () => void {
  let tries = 80;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    if (cancelled) return;
    if (check()) {
      cb();
      return;
    }
    if (--tries <= 0) return;
    timer = setTimeout(tick, 100);
  };
  tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export function pickFirstError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown> & { errors?: { message?: unknown }[] };
  if (typeof d.error === "string") return d.error;
  if (typeof d.errors?.[0]?.message === "string") return d.errors[0].message as string;
  for (const k of Object.keys(d)) {
    if (k === "_auth" || k === "errors") continue;
    if (typeof d[k] === "string") return d[k] as string;
  }
  return null;
}

const SAFE_NEXT_BASE = "http://sefaria-safenext.invalid"; // fake base, never sent anywhere — just lets URL parsing compare origins
// C0 controls, DEL and C1 controls
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/; // eslint-disable-line no-control-regex

/**
 * `next` if it stays on this site, else "/". Rejects absolute URLs, `//host`, and what browsers normalise into `//host` (tabs and
 * newlines are dropped by URL parsing: "/\t/evil.com" is https://evil.com/). Any control character (C0, DEL, C1) is a refusal, never
 * stripped, so the value returned is the value checked. The one implementation for every `next` (CODE_REVIEW R-03).
 */
export function safeNext(next: unknown): string {
  if (!next || typeof next !== "string") return "/";
  // refused, never stripped: a character taken out after the checks could join what they judged apart ("java\x7fscript:",
  // "\x7f//host"); the value returned is always exactly the value checked
  if (CONTROL.test(next)) return "/";
  try {
    const u = new URL(next, SAFE_NEXT_BASE);
    if (u.origin !== SAFE_NEXT_BASE) return "/";
    // an absolute path comes back as parsed, and only if it is still a path of this site (no "/%2F%2Fhost", "/%5Chost", "/..//host")
    if (next.startsWith("/")) {
      const path = `${u.pathname}${u.search}${u.hash}`;
      return isLocalPath(path) ? path : "/";
    }
    // a bare relative one ("sheets/123", as the old client allowed): no scheme, no backslash, no edge space, no "." or ".." segment
    // or "//" (which resolve into "//…"), no encoded slash or backslash, nothing that is not well-formed
    if (/^[a-z][a-z0-9+.-]*:/i.test(next) || /\\|%5c|%2f/i.test(next) || next.trim() !== next) return "/";
    if (/(^|\/)\.{1,2}(\/|$|[?#])|\/\//.test(next.split(/[?#]/, 1)[0]!) || !isLocalPath(`/${next}`)) return "/";
    return next;
  } catch {
    return "/";
  }
}

/** Whether a bare path (as clicked in-app) enters the auth experience. Reset-confirm links are only ever reached from an email. */
export function isAuthPath(pathname: string): boolean {
  return /^\/(login|register)\/?$/.test(pathname);
}

/** Which flow a path (pathname + optional search) represents. */
export function pathToFlow(path: string): AuthFlow {
  if (/^\/password\/reset\/confirm\//.test(path)) return "reset";
  return /^\/register(\/|\?|$)/.test(path) ? "register" : "login";
}

export function withNext(path: string, next = "/"): string {
  return next && next !== "/" ? `${path}?next=${encodeURIComponent(next)}` : path;
}

export function flowToPath(flow: AuthFlow, next = "/"): string {
  return withNext(flow === "register" ? "/register" : "/login", next);
}

export function nextFromPath(path: string): string {
  return safeNext(new URLSearchParams(path.split("?")[1] || "").get("next") || "/");
}

export function checkPasswordsMatch(p1: string, p2: string): string | null {
  return p2 && p1 !== p2 ? "auth.passwords_dont_match" : null;
}

export function requiredFieldValidate(value: string): string | null {
  return value.trim() ? null : "auth.required_field";
}

/** auth.invalid_email matches the key sso/views.py returns for the same failure. */
export function emailValidate(el: { validity: { typeMismatch: boolean } }): string | null {
  return el.validity.typeMismatch ? "auth.invalid_email" : null;
}

type SetFieldError = (key: string, message: string | null) => void;
type ChangeEvent = { target: { value: string } };

/**
 * The field-error convention shared by every auth form: a value is judged on blur (onBlurValidate sets the error), typing may only
 * ever clear an error already showing (onChangeClear) — never set one, and never touch one set elsewhere (by the server) while the
 * value is still invalid.
 */
export function onBlurValidate(key: string, validate: () => string | null, setFieldError: SetFieldError) {
  return () => setFieldError(key, validate());
}

export function onChangeClear<E extends ChangeEvent>(
  key: string,
  onChange: (e: E) => void,
  validate: (value: string) => string | null,
  fieldErrors: FieldErrors,
  setFieldError: SetFieldError,
) {
  return (e: E) => {
    onChange(e);
    if (fieldErrors[key] && !validate(e.target.value)) setFieldError(key, null);
  };
}

/** The banner error for a failed answer: its first error message (or `fallback`) plus the `_auth` metadata (code, providers). */
export function authError(data: unknown, fallback: string): AuthError {
  const metadata = (data as { _auth?: { code?: string; providers?: unknown } } | null | undefined)?._auth;
  return {
    message: pickFirstError(data) || fallback,
    code: metadata?.code,
    providers: Array.isArray(metadata?.providers) ? (metadata.providers as string[]) : [],
  };
}
