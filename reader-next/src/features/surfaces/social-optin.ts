/**
 * Coming in through Social opts a browser in to this client. In the chart's optin mode nginx sends /social and /social/… here
 * whatever the cookies say (legacy Django has no Social pages), and any page request carrying `reader_social=1`
 * (helm-chart/sefaria/conf/nginx.template.conf.tpl, `$reader_page`). A Social page sets that cookie, so whoever arrived by a Social
 * link (a room invite, a shiur) keeps the new reader on every later page and reload, signed in or not, staff or not.
 *
 * Its own cookie, not `reader_version`: Django's ReaderChoiceMiddleware clears `reader_version=next` for anyone outside the opt-in
 * audience, and leaves this one alone. Host-only (no Domain), a year. The kill switch and "back to the classic reader" clear it
 * (src/features/shell/reader-choice.ts); like the other routing cookies it is routing, not access.
 *
 * @feature SHL-076 Social lab and /social routes
 */
export const SOCIAL_COOKIE = "reader_social";
export const SOCIAL_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

function maybeDocument(): Document | null {
  return typeof document === "undefined" ? null : document;
}

export function hasSocialCookie(cookie: string): boolean {
  return cookie.split(/;\s*/).includes(`${SOCIAL_COOKIE}=1`);
}

function cookieTail(doc: Document): string {
  const secure = doc.location?.protocol === "https:" ? "; secure" : "";
  return `; path=/; samesite=lax${secure}`;
}

/** Set on a Social page; refreshes the year each visit. */
export function setSocialCookie(doc: Document | null = maybeDocument()): void {
  if (!doc) return;
  try {
    doc.cookie = `${SOCIAL_COOKIE}=1; max-age=${SOCIAL_COOKIE_MAX_AGE_S}${cookieTail(doc)}`;
  } catch {
    /* cookies blocked: Social's own pages still reach this client; other pages go to the classic reader */
  }
}

export function clearSocialCookie(doc: Document | null = maybeDocument()): void {
  if (!doc || !hasSocialCookie(doc.cookie)) return;
  try {
    doc.cookie = `${SOCIAL_COOKIE}=; max-age=0${cookieTail(doc)}`;
  } catch {
    /* blocked */
  }
}
