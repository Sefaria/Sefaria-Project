/**
 * The signed-in reader's textual custom (profile setting `textual_custom`: "sephardi" or "ashkenazi"), which picks the haftarah on the
 * Learning Schedules page in the weeks the customs differ. The old page had it from the server (reader/views.py
 * _get_user_calendar_params: the profile's setting, "ashkenazi" when it has none or nobody is signed in).
 *
 * Asked from `GET /api/profile/<slug>`, which answers the full profile, settings included, only to its owner (profile_api:
 * `to_api_dict(basic = not owner_of_profile)`); anyone else gets the basic profile without settings, which reads as "ashkenazi".
 *
 * @feature CAL-001 Learning Schedules page
 */
import { SIGNED_OUT_CUSTOM } from "~/lib/library/calendars";

/** "/profile/<slug>" (the viewer's profileUrl) → the slug, or null. */
export function profileSlug(profileUrl: string | undefined): string | null {
  const m = /^\/profile\/([^/?#]+)\/?$/.exec(profileUrl ?? "");
  return m ? m[1]! : null;
}

/** The custom in a profile API answer: its settings' textual_custom, else "ashkenazi". */
export function customFromProfile(profile: unknown): string {
  const c = (profile as { settings?: { textual_custom?: unknown } } | null)?.settings?.textual_custom;
  return typeof c === "string" && c ? c : SIGNED_OUT_CUSTOM;
}

/**
 * The reader's custom. `origin` is "" in the browser (same origin, the session cookie goes along) or the internal API origin on the
 * server, where `cookie` is the reader's Cookie header. Never throws: anything unexpected is the default.
 */
export async function fetchTextualCustom(origin: string, slug: string | null, cookie?: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!slug) return SIGNED_OUT_CUSTOM;
  const path = `/api/profile/${encodeURIComponent(slug)}`;
  const url = origin ? `${origin}${path}` : typeof window !== "undefined" ? new URL(path, window.location.href).href : path;
  const init: RequestInit = cookie !== undefined ? { headers: { cookie, accept: "application/json" } } : { credentials: "same-origin", headers: { accept: "application/json" } };
  try {
    const r = await fetchImpl(url, init);
    if (!r.ok) return SIGNED_OUT_CUSTOM;
    return customFromProfile(await r.json());
  } catch {
    return SIGNED_OUT_CUSTOM;
  }
}
