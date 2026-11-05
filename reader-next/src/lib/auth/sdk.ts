/**
 * The third-party sign-in SDKs, from the same URLs the old site's templates/base.html loads them (only for signed-out readers):
 * Google Identity Services (fires `google-identity-loaded` on load, which One Tap listens for), Sign in with Apple, and reCAPTCHA v2
 * (explicit render, interface language). Each is loaded at most once, async, and only when its key is configured.
 *
 * @feature ACC-012 Sign in with Google and Apple
 * @feature ACC-010 Email registration with reCAPTCHA
 */
export const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";
export const APPLE_SDK_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
export const recaptchaSrc = (lang: "english" | "hebrew") => `https://www.google.com/recaptcha/api.js?render=explicit&hl=${lang === "hebrew" ? "he" : "en"}`;

/** Add a `<script async defer>` once; `onload` runs when it has loaded. */
export function loadScript(src: string, onload?: () => void): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) return;
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.defer = true;
  if (onload) s.onload = onload;
  document.head.appendChild(s);
}

export const loadGoogleIdentity = () => loadScript(GOOGLE_GSI_SRC, () => window.dispatchEvent(new Event("google-identity-loaded")));
export const loadAppleSdk = () => loadScript(APPLE_SDK_SRC);
export const loadRecaptcha = (lang: "english" | "hebrew") => {
  // one reCAPTCHA per page, whatever its hl
  if (document.querySelector('script[src^="https://www.google.com/recaptcha/api.js"]')) return;
  loadScript(recaptchaSrc(lang));
};

/** Phones and narrow windows use full-page redirects instead of popups (Sefaria.ssoUseRedirect in the old sefaria.js). */
export function ssoUseRedirect(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(max-width: 767px)").matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// The bits of the SDKs this client calls.
export interface GoogleIdApi {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
  prompt: (listener?: (n: unknown) => void) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
    AppleID?: { auth?: { init: (c: Record<string, unknown>) => void; signIn: () => Promise<unknown> | unknown } };
    grecaptcha?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => number;
      reset: (id?: number) => void;
      ready?: (cb: () => void) => void;
    };
  }
}
