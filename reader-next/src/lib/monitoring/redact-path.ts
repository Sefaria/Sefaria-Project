/**
 * A page path safe to log: the segments that carry a secret or identify a person are collapsed, everywhere a path is logged (browser
 * error reports, including URLs inside messages and stacks, and the server's request log). The query string is dropped by the
 * callers; this handles the path itself.
 *
 *  /password/reset/confirm/<uidb64>/<token>/   → /password/reset/confirm/:uid/:token/     (Django's reset link)
 *  /accounts/password/reset/key/<key>/          → /accounts/password/reset/key/:token/     (allauth)
 *  …/set-password/<…>, …/confirm-email/<…>, …/unsubscribe/<…>, …/verify[-email]/<…>, …/key/<…>, …/token/<…> → …/:token
 *  /profile/<slug>[/…]                          → /profile/:slug[/…]
 *  /api/collections/<slug>/invite/<uid|email>   → …/invite/:who
 *  an e-mail address anywhere (also %40-encoded) → [email]
 *  any other segment that looks like a token (24+ letters/digits/-/:, both letters and digits, no dot) → :token
 *
 * Matching ignores case (the router matches routes case-insensitively, so /Password/Reset/Confirm/… is the same page) and sees
 * through an encoded slash (%2F) and `;parameters`. It runs on every request, so it is linear: one pass over the segments, looking
 * back at most three, and any path longer than MAX_PATH is replaced whole.
 *
 * @feature ANL-017 Browser error reporting
 */

export const MAX_PATH = 2048;
export const LONG_PATH = "/:long-path";

/** A path keyword after which every following segment is a secret. */
const SECRET_AFTER = /^(?:set-password|confirm-email|unsubscribe|verify|verify-email|key|token|activate|magic-link|login-code|code)$/i;
const TOKEN_LIKE = /^(?=[A-Za-z0-9:-]*[0-9])(?=[A-Za-z0-9:-]*[A-Za-z])[A-Za-z0-9:-]{24,}$/;
/** Bounded on both sides of the @, so a long run of address characters cannot make the search quadratic. */
const EMAIL = /[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/gi;

/** A segment's keyword as Django reads it: %XX escapes decoded (/password/reset/%63onfirm/… is the reset page), ;parameters cut. */
function keyword(raw: string): string {
  const s = raw.split(";", 1)[0]!;
  try {
    return decodeURIComponent(s).toLowerCase();
  } catch {
    return s.toLowerCase(); // a malformed escape: compare as written
  }
}

export function redactPath(path: string): string {
  if (path.length > MAX_PATH) return LONG_PATH;
  const slash = path.endsWith("/") && path.length > 1;
  const segs = path.replace(EMAIL, "[email]").replace(/%2f/gi, "/").split("/");
  const out: string[] = [];
  // the last three segments seen, lower-cased, without ;parameters
  let p1 = "";
  let p2 = "";
  let p3 = "";
  let secretRest = false;
  for (let i = 0; i < segs.length; i++) {
    const raw = segs[i]!;
    if (i === 0 || raw === "") {
      out.push(raw);
      continue;
    }
    const s = keyword(raw);
    if (secretRest) out.push(":token");
    else if (p3 === "password" && p2 === "reset" && p1 === "confirm") {
      out.push(":uid");
      secretRest = true;
    } else if (p1 === "profile") out.push(":slug");
    else if (p1 === "invite" && p3 === "collections") out.push(":who");
    else if (TOKEN_LIKE.test(raw.split(";", 1)[0]!)) out.push(":token");
    else out.push(raw); // a title may contain ";" (Redeeming_Relevance;_Exodus…): kept as written
    if (!secretRest && SECRET_AFTER.test(s)) secretRest = true;
    p3 = p2;
    p2 = p1;
    p1 = s;
  }
  const joined = out.join("/");
  return slash && !joined.endsWith("/") ? `${joined}/` : joined;
}
