/**
 * The site-wide promo's "Maybe later" back-off, as the old SiteWideBanner.jsx keeps it (same localStorage keys and cookie, so a
 * reader's dismissals carry over between the old client and this one): each "Maybe later" hides the banner until both a number of
 * new sessions and a number of days have passed (the schedule comes from remote config), and the third hides it for good.
 *
 * @feature PRM-014 Site-wide banner with maybe-later back-off
 */
export interface NudgeRule {
  sessions: number;
  days: number;
}
export type NudgeSchedule = Record<string, NudgeRule>;

export interface BackoffState {
  maybeLaterCount?: number;
  lastDismissalTime?: number;
  sessionCountAtLastDismissal?: number | null;
  dismissedForever?: boolean;
}

export const DEFAULT_PROMO_SESSION_LENGTH_SECONDS = 30 * 60;
export const MAX_MAYBE_LATER_CLICKS = 3;
export const NUDGE_SCHEDULE: NudgeSchedule = { 1: { sessions: 2, days: 7 }, 2: { sessions: 4, days: 21 } };
const SECONDS_PER_DAY = 24 * 60 * 60;

export const promoStorageKeys = (cookieName: string) => {
  const prefix = `promo_backoff_${cookieName}`;
  return { state: `${prefix}_state`, sessionCounter: `${prefix}_session_counter`, lastSessionAtSec: `${prefix}_last_session_at_sec` };
};

export const sessionLengthSeconds = (configured: unknown) => {
  const n = Number(configured);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PROMO_SESSION_LENGTH_SECONDS;
};

/** Counts a new session when the last one began longer ago than the session length; returns the session count. */
export function updateSessionCounter(storage: Storage, cookieName: string, lengthSeconds: number, nowSec = Math.floor(Date.now() / 1000)): number {
  const keys = promoStorageKeys(cookieName);
  const last = storage.getItem(keys.lastSessionAtSec);
  const lastAt = last === null ? NaN : Number(last);
  const current = Number(storage.getItem(keys.sessionCounter)) || 0;
  if (Number.isFinite(lastAt) && nowSec - lastAt < lengthSeconds) return current;
  storage.setItem(keys.sessionCounter, String(current + 1));
  storage.setItem(keys.lastSessionAtSec, String(nowSec));
  return current + 1;
}

/** A dismissal from the old close button (only `<cookie>=1`, no time) counts as one "Maybe later" from long ago. */
export function migrateLegacyCookie(storage: Storage, cookieName: string, cookie: string): void {
  const keys = promoStorageKeys(cookieName);
  if (storage.getItem(keys.state) || !cookie.includes(cookieName)) return;
  storage.setItem(keys.state, JSON.stringify({ maybeLaterCount: 1, lastDismissalTime: 0, sessionCountAtLastDismissal: 0, dismissedForever: false }));
}

export function readState(storage: Storage, cookieName: string): BackoffState {
  try {
    return (JSON.parse(storage.getItem(promoStorageKeys(cookieName).state) ?? "null") as BackoffState | null) ?? {};
  } catch {
    return {};
  }
}

export function shouldHide(state: BackoffState | null | undefined, sessionCounter: number, schedule: NudgeSchedule = NUDGE_SCHEDULE, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!state) return false;
  if (state.dismissedForever || (state.maybeLaterCount ?? 0) >= MAX_MAYBE_LATER_CLICKS) return true;
  const rule = schedule[String(state.maybeLaterCount)];
  if (!rule) return false;
  const sessions = sessionCounter - Number(state.sessionCountAtLastDismissal || 0);
  const seconds = nowSec - Number(state.lastDismissalTime || 0);
  return !(sessions >= rule.sessions && seconds >= rule.days * SECONDS_PER_DAY);
}

/** Records one "Maybe later". */
export function recordMaybeLater(storage: Storage, cookieName: string, sessionCounter: number, nowSec = Math.floor(Date.now() / 1000)): BackoffState {
  const count = Math.min(Number(readState(storage, cookieName).maybeLaterCount || 0) + 1, MAX_MAYBE_LATER_CLICKS);
  const next: BackoffState = { maybeLaterCount: count, lastDismissalTime: nowSec, sessionCountAtLastDismissal: sessionCounter, dismissedForever: count >= MAX_MAYBE_LATER_CLICKS };
  storage.setItem(promoStorageKeys(cookieName).state, JSON.stringify(next));
  return next;
}

/**
 * The same decision as a self-contained inline script, run in the page before its first paint: it counts the session, applies an old
 * close-button cookie, and marks <html data-promo-hidden> when the banner must stay away — so a server-rendered banner that the
 * reader has put off never shows, and one that shows never pushes the page down after it is up (the jump-free rule).
 */
export function backoffScript(cookieName: string, schedule: NudgeSchedule = NUDGE_SCHEDULE, lengthSeconds = DEFAULT_PROMO_SESSION_LENGTH_SECONDS): string {
  const k = promoStorageKeys(cookieName);
  return `(function(){var d=document.documentElement;try{var ls=localStorage,C=${JSON.stringify(cookieName)},S=${JSON.stringify(schedule)},L=${Number(lengthSeconds)},ks=${JSON.stringify(k.state)},kc=${JSON.stringify(k.sessionCounter)},kl=${JSON.stringify(k.lastSessionAtSec)};` +
    `if(!ls.getItem(ks)&&document.cookie.indexOf(C)>-1)ls.setItem(ks,JSON.stringify({maybeLaterCount:1,lastDismissalTime:0,sessionCountAtLastDismissal:0,dismissedForever:false}));` +
    `var now=Math.floor(Date.now()/1000),l=ls.getItem(kl),la=l===null?NaN:Number(l),cur=Number(ls.getItem(kc))||0;` +
    `if(!(isFinite(la)&&now-la<L)){cur+=1;ls.setItem(kc,String(cur));ls.setItem(kl,String(now));}` +
    `var st=null;try{st=JSON.parse(ls.getItem(ks)||"null")}catch(e){}var hide=false;` +
    `if(st){if(st.dismissedForever||(st.maybeLaterCount||0)>=${MAX_MAYBE_LATER_CLICKS})hide=true;else{var r=S[String(st.maybeLaterCount)];if(r)hide=!((cur-Number(st.sessionCountAtLastDismissal||0))>=r.sessions&&(now-Number(st.lastDismissalTime||0))>=r.days*86400);}}` +
    `if(hide)d.setAttribute("data-promo-hidden","");}catch(e){d.setAttribute("data-promo-hidden","");}})();`;
}
