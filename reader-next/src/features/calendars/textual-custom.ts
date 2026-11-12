/**
 * The signed-in reader's textual custom, for the Learning Schedules page's haftarah (src/lib/user/textual-custom.ts). On the server the
 * reader's Cookie header goes to Django with the profile request (only when it carries a session); the browser asks through the same
 * server function. Signed out: "ashkenazi", with no request.
 *
 * @feature CAL-004 Learning Schedules follow the reader's location and custom
 * @feature CAL-005 Calendars refresh after a settings change (the user queries are invalidated by sefaria:settings-updated)
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { queryOptions } from "@tanstack/react-query";
import { API_ORIGIN } from "~/lib/config";
import { POLICIES } from "~/lib/cache/policies";
import { hasSessionCookie } from "~/lib/auth/session";
import { SIGNED_OUT_CUSTOM } from "~/lib/library/calendars";
import { fetchTextualCustom, profileSlug } from "~/lib/user/textual-custom";
import { segment } from "~/lib/server-fn/input";

/** The slug goes into /api/profile/<slug> on the internal origin with the reader's cookie: one segment, never "." or "..". */
export const validateProfileSlug = (slug: unknown): string => (slug === "" ? "" : segment(slug, "profile slug", 200));

const getCustomOnServer = createServerFn({ method: "GET" })
  .validator(validateProfileSlug)
  .handler(async ({ data: slug }): Promise<string> => {
    const cookie = getRequestHeader("cookie") ?? "";
    if (!slug || !hasSessionCookie(cookie)) return SIGNED_OUT_CUSTOM;
    return fetchTextualCustom(API_ORIGIN, slug, cookie);
  });

/** `profileUrl`: the viewer's ("/profile/<slug>"); undefined when nobody is signed in. */
export const textualCustomQuery = (profileUrl: string | undefined) => {
  const slug = profileSlug(profileUrl);
  return queryOptions({
    queryKey: ["user", "textual-custom", slug ?? ""] as const,
    // the browser asks through this server too (a server function, the session cookie along): /api is not on the page's origin in
    // every deployment (dev, e2e), and a same-origin /api/profile there would quietly read as "ashkenazi"
    queryFn: (): Promise<string> => (!slug ? Promise.resolve(SIGNED_OUT_CUSTOM) : getCustomOnServer({ data: slug })),
    staleTime: 5 * 60_000,
    gcTime: POLICIES.user.gcTime,
    retry: false,
  });
};
