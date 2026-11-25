/**
 * Where a sign-up journey started (ANL-002): the `data-signup-source` of the clicked control (or its ancestor) — nav_bar,
 * login_prompt, signup_modal_<kind>, login_crosslink — handed to the auth page for the funnel's sign_up_flow_started. The old
 * ReaderApp read it in its in-app link handler; here one capturing click listener records it for links to /login or /register, and
 * the auth page takes it when it arrives. A typed or bookmarked /register has no source (null), as before.
 *
 * @feature ANL-002 Sign-up source attribution
 */
import { isAuthPath } from "~/lib/auth/utils";

let pending: { path: string; source: string } | null = null;
let installed = false;

export function recordSignupSource(path: string, source: string | null | undefined) {
  pending = source ? { path, source } : null;
}

/** The source recorded for a navigation to `pathname`, once. */
export function takeSignupSource(pathname: string): string | null {
  const p = pending;
  pending = null;
  return p && p.path === pathname.replace(/\/$/, "") ? p.source : null;
}

export function installSignupSourceCapture() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !isAuthPath(url.pathname)) return;
      const src = a.closest("[data-signup-source]")?.getAttribute("data-signup-source");
      recordSignupSource(url.pathname.replace(/\/$/, ""), src);
    },
    true,
  );
}
