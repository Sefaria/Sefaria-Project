/**
 * A page path safe to log: the segments that carry a secret or identify a person are collapsed, everywhere a path is logged (browser
 * error reports, the server's request log). The query string is dropped by the callers; this handles the path itself.
 *
 *  /password/reset/confirm/<uidb64>/<token>/   → /password/reset/confirm/:uid/:token/     (Django's reset link)
 *  /accounts/password/reset/key/<key>/          → /accounts/password/reset/key/:key/       (allauth)
 *  …/set-password/<…>                           → …/set-password/:token
 *  …/confirm-email/<key>                        → …/confirm-email/:key                      (allauth, Django)
 *  …/unsubscribe/<…>                            → …/unsubscribe/:token
 *  …/verify[-email]/<…>, …/key/<…>, …/token/<…> → …/:token
 *  /profile/<slug>[/…]                          → /profile/:slug[/…]
 *  /api/collections/<slug>/invite/<uid|email>   → …/invite/:who
 *  an e-mail address anywhere (also %40-encoded) → [email]
 *  any other segment that looks like a token (24+ letters/digits/-/:, both letters and digits, no dot) → :token
 *
 * @feature ANL-017 Browser error reporting
 */

/** A path keyword after which every following segment is a secret. */
const SECRET_AFTER = /^(?:set-password|confirm-email|unsubscribe|verify|verify-email|key|token|activate|magic-link|login-code|code)$/i;
const TOKEN_LIKE = /^(?=[A-Za-z0-9:-]*[0-9])(?=[A-Za-z0-9:-]*[A-Za-z])[A-Za-z0-9:-]{24,}$/;
const EMAIL = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi;

export function redactPath(path: string): string {
  const slash = path.endsWith("/") && path.length > 1;
  const segs = path.replace(EMAIL, "[email]").split("/");
  const out: string[] = [];
  let secretRest = false;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (i === 0 || s === "") {
      out.push(s);
      continue;
    }
    const prev = segs.slice(0, i).join("/");
    if (secretRest) out.push(":token");
    else if (/\/password\/reset\/confirm$/.test(prev)) {
      out.push(":uid");
      secretRest = true;
    } else if (/\/profile$/.test(prev)) out.push(":slug");
    else if (/\/collections\/[^/]+\/invite$/.test(prev)) out.push(":who");
    else if (TOKEN_LIKE.test(s)) out.push(":token");
    else out.push(s);
    if (!secretRest && SECRET_AFTER.test(s)) secretRest = true;
  }
  const joined = out.join("/");
  return slash && !joined.endsWith("/") ? `${joined}/` : joined;
}
