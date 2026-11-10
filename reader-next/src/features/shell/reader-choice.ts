/**
 * The reader's choice between this client and the classic one, as the new reader sees it (LAUNCH_PLAN T-D05 client half, T-C03
 * client half). The routing cookie `reader_version=next` (set by Django: sefaria/helper/reader_choice.py) is what sends a page
 * request here in the chart's `optin` mode; while it is present the opt-in exists for this reader, so the menus offer the way back.
 *
 *  - Back to the classic reader: POST READER_CHOICE_URL {reader: "legacy"} (Django stores the profile choice and clears the cookie;
 *    the endpoint is lane B's), then clear the cookie here too and reload: the next request goes to the classic reader.
 *  - Kill switch: remote config `feature.reader.next.disabled` true clears the cookie and reloads into the classic reader, once per
 *    browser session (a deployment that still serves this client without the cookie must not reload forever).
 *
 * @feature ACC-003 Account settings page (the reader choice, T-D05)
 */
import { postJson } from "~/lib/auth/http";

/** Lane B's endpoint (one constant, so the integrator can adjust it). */
export const READER_CHOICE_URL = "/api/reader-choice";
export const READER_COOKIE = "reader_version";
export const KILL_SWITCH_KEY = "feature.reader.next.disabled";
const KILLED_KEY = "reader_next_kill_switch_reloaded";

export function readerCookie(cookie: string): string | null {
  for (const part of cookie.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === READER_COOKIE) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

/** The reader came here by opting in (the cookie Django set). */
export const optedIn = (cookie: string) => readerCookie(cookie) === "next";

/** Is the remote kill switch on? A bool entry (or 1 / "1" / "true"). */
export function killSwitchOn(remote: Record<string, unknown> | undefined): boolean {
  const v = remote?.[KILL_SWITCH_KEY];
  return v === true || v === 1 || v === "1" || v === "true";
}

/** The cookie domains to clear: the host itself and each parent domain (Django sets it on the site's cookie domain, ".sefaria.org"). */
export function cookieDomains(hostname: string): string[] {
  if (!hostname.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return [];
  const parts = hostname.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

/** Clear the routing cookie on this host and its parent domains. */
export function clearReaderCookie(doc: Document = document, hostname: string = location.hostname): void {
  const expire = `${READER_COOKIE}=; path=/; max-age=0; samesite=lax`;
  doc.cookie = expire;
  for (const d of cookieDomains(hostname)) doc.cookie = `${expire}; domain=${d}`;
}

export interface LeaveDeps {
  doc?: Document;
  hostname?: string;
  reload?: () => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

/**
 * The kill switch's client half: when the switch is on and this reader came by the cookie, clear it and reload (once per session).
 * Returns whether it reloaded.
 */
export function applyKillSwitch(remote: Record<string, unknown> | undefined, deps: LeaveDeps = {}): boolean {
  const doc = deps.doc ?? document;
  if (!killSwitchOn(remote) || !readerCookie(doc.cookie)) return false;
  const storage = deps.storage === undefined ? safeSession() : deps.storage;
  try {
    if (storage?.getItem(KILLED_KEY)) return false;
    storage?.setItem(KILLED_KEY, "1");
  } catch {
    /* storage blocked: still leave once */
  }
  clearReaderCookie(doc, deps.hostname ?? location.hostname);
  (deps.reload ?? (() => location.reload()))();
  return true;
}

function safeSession(): Storage | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Back to the classic reader: tell Django (profile + cookie), clear the cookie here as well, reload. */
export async function backToClassic(deps: LeaveDeps & { post?: typeof postJson } = {}): Promise<{ ok: boolean; status: number }> {
  const res = await (deps.post ?? postJson)(READER_CHOICE_URL, { reader: "legacy" });
  // even when the endpoint is missing or refuses, the cookie is ours to clear: this browser goes back now
  clearReaderCookie(deps.doc ?? document, deps.hostname ?? location.hostname);
  (deps.reload ?? (() => location.reload()))();
  return { ok: res.ok, status: res.status };
}
