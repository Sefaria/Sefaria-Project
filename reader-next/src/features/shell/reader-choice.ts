/**
 * The reader's choice between this client and the classic one, as the new reader sees it (the
 * client half; Django owns the other). The routing cookie `reader_version=next` (set by Django: sefaria/helper/reader_choice.py) is what sends a page
 * request here in the chart's `optin` mode; while it is present the opt-in exists for this reader, so the menus offer the way back.
 *
 *  - Back to the classic reader: POST READER_CHOICE_URL {reader: "legacy"} (Django stores the profile choice and clears the cookie;
 *    sefaria/helper/reader_choice.py), then clear the cookie here too and reload: the next request goes to the classic reader.
 *  - Kill switch: remote config `feature.reader.next.disabled` true clears the cookie and reloads into the classic reader, at most once
 *    every RELOAD_INTERVAL_MS per browser session (a deployment that still serves this client must not reload forever, and a switch
 *    flipped again later still takes effect). Django must not set the cookie again meanwhile (Django's ReaderChoiceMiddleware).
 *
 * @feature ACC-003 Account settings page (the reader choice)
 */
import { postJson, type PostResult } from "~/lib/auth/http";
import { reportError } from "~/lib/monitoring/error-reporter";

/** Django's reader-choice endpoint (one constant, so it changes in one place). */
export const READER_CHOICE_URL = "/api/reader-choice";
export const READER_COOKIE = "reader_version";
export const KILL_SWITCH_KEY = "feature.reader.next.disabled";
const KILLED_KEY = "reader_next_kill_switch_reloaded";
/** The kill switch reloads at most this often (per browser session). */
export const RELOAD_INTERVAL_MS = 10 * 60_000;
/** Back to classic waits this long for Django, then goes anyway. */
export const BACK_TIMEOUT_MS = 3_000;

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
  now?: () => number;
}

/**
 * The kill switch's client half: when the switch is on and this reader came by the cookie, clear it and reload (at most once per
 * RELOAD_INTERVAL_MS in a session; the time of the last reload is kept in sessionStorage).
 * Returns whether it reloaded.
 */
export function applyKillSwitch(remote: Record<string, unknown> | undefined, deps: LeaveDeps = {}): boolean {
  const doc = deps.doc ?? document;
  if (!killSwitchOn(remote) || !readerCookie(doc.cookie)) return false;
  const storage = deps.storage === undefined ? safeSession() : deps.storage;
  const now = (deps.now ?? Date.now)();
  try {
    const last = Number(storage?.getItem(KILLED_KEY));
    if (last && now - last < RELOAD_INTERVAL_MS) return false;
    storage?.setItem(KILLED_KEY, String(now));
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

/**
 * Back to the classic reader: tell Django (profile + cookie), waiting at most BACK_TIMEOUT_MS, then clear the cookie here as well and
 * reload, whatever Django answered. A failure or a timeout is reported (src/lib/monitoring/error-reporter.ts).
 */
export async function backToClassic(deps: LeaveDeps & { post?: typeof postJson; timeoutMs?: number } = {}): Promise<{ ok: boolean; status: number; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((r) => (timer = setTimeout(() => r("timeout"), deps.timeoutMs ?? BACK_TIMEOUT_MS)));
  const res: PostResult | "timeout" = await Promise.race([(deps.post ?? postJson)(READER_CHOICE_URL, { reader: "legacy" }), timeout]);
  clearTimeout(timer);
  const timedOut = res === "timeout";
  const ok = !timedOut && res.ok;
  const status = timedOut ? 0 : res.status;
  if (!ok) reportError("error", new Error(`reader-choice: back to classic ${timedOut ? "timed out" : `failed (HTTP ${status})`}`));
  // the cookie is ours to clear whatever Django said: this browser goes back now
  clearReaderCookie(deps.doc ?? document, deps.hostname ?? location.hostname);
  (deps.reload ?? (() => location.reload()))();
  return { ok, status, timedOut };
}
