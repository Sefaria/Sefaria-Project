/**
 * Who is signed in.
 *
 * The plan said `GET /api/profile`, but Django's profile_api (reader/views.py) raises Http404 when no slug is given — for anonymous
 * AND signed-in readers alike (VERIFIED 2026-10-06: www.sefaria.org/api/profile answers the HTML 404 page). The old client never asks:
 * Django writes `_uid`, `full_name`, `profile_pic_url`, `slug` into its pages. This client asks two JSON endpoints instead:
 *  1. allauth headless `GET /_allauth/browser/v1/auth/session` — 200 `{data: {user: {id, display, email…}}, meta: {is_authenticated: true}}`
 *     when signed in, 401 `{meta: {is_authenticated: false}}` when not (VERIFIED 2026-10-06, anonymous). It also sets the csrftoken
 *     cookie, so a later write has a token.
 *  2. `GET /api/user_stats/<id>?quick=1` — public_user_data(uid): `{name, profileUrl, imageUrl, uid, isStaff…}`; only answers for the
 *     signed-in user themself (login_required + uid check). Gives the header its name, picture and profile link.
 * Neither is cached by Varnish (not on its cacheable list), and both need the session cookie.
 *
 * @feature ACC-007 Auth routes and in-app auth page mounting
 * @feature GUI-010 Profile / account dropdown
 */
export const SESSION_URL = "/_allauth/browser/v1/auth/session";
export const userStatsUrl = (id: number) => `/api/user_stats/${id}?quick=1`;

export interface Viewer {
  id: number;
  name: string;
  email?: string;
  /** The small profile picture (public_user_data's profile_pic_url_small); may be a gravatar URL, which shows initials. */
  imageUrl?: string;
  /** "/profile/<slug>" */
  profileUrl?: string;
  isStaff?: boolean;
}

interface SessionAnswer {
  data?: { user?: { id?: number; display?: string; email?: string } };
  meta?: { is_authenticated?: boolean };
}

/** The cookie names that can carry a Django session (settings use Django's default name). */
export const hasSessionCookie = (cookieHeader: string) => /(?:^|;\s*)sessionid=/.test(cookieHeader);

/**
 * The signed-in reader, or null. `origin` is "" in the browser (same origin) or the internal API origin on the server, where
 * `cookie` is the reader's Cookie header, forwarded as is. Never throws: anything unexpected means "not signed in".
 */
export async function fetchViewer(origin: string, cookie?: string, fetchImpl: typeof fetch = fetch): Promise<Viewer | null> {
  const init: RequestInit = cookie !== undefined ? { headers: { cookie, accept: "application/json" } } : { credentials: "same-origin", headers: { accept: "application/json" } };
  const abs = (p: string) => (origin ? `${origin}${p}` : typeof window !== "undefined" ? new URL(p, window.location.href).href : p);
  try {
    const res = await fetchImpl(abs(SESSION_URL), init);
    if (res.status !== 200) return null;
    const s = (await res.json()) as SessionAnswer;
    const user = s.data?.user;
    if (!s.meta?.is_authenticated || typeof user?.id !== "number") return null;
    const viewer: Viewer = { id: user.id, name: user.display ?? "", email: user.email };
    try {
      const r = await fetchImpl(abs(userStatsUrl(user.id)), init);
      if (r.ok) {
        const p = (await r.json()) as { name?: string; imageUrl?: string; profileUrl?: string; isStaff?: boolean };
        if (p.name) viewer.name = p.name;
        viewer.imageUrl = p.imageUrl || undefined;
        viewer.profileUrl = p.profileUrl || undefined;
        viewer.isStaff = !!p.isStaff;
      }
    } catch {
      /* the header falls back to the session's display name */
    }
    return viewer;
  } catch {
    return null;
  }
}

/** Initials as the old ProfilePic drew them: first letter of the first and last word. */
export function initials(name: string): string {
  const parts = name.trim() ? name.trim().split(/\s+/) : [];
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0]![0]! : parts[0]![0]! + parts[parts.length - 1]![0]!;
}
