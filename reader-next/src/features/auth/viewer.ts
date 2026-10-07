/**
 * The `user` query: who is signed in, known at first paint.
 *
 * On the server the reader's own Cookie header is forwarded to Django (through Varnish, which passes these URLs) — but only when it
 * carries a `sessionid`: without one nobody is signed in and no request is made. The answer is dehydrated into the page, so the
 * header renders signed in/out on the server and hydration does not refetch. In the browser (after 5 minutes, or on focus once
 * stale) the same endpoints are asked same-origin. Sign-in and sign-out are full page loads (as on the old site), so the answer
 * cannot go stale in a way that matters within a page.
 *
 * @feature ACC-007 Auth routes and in-app auth page mounting
 * @feature GUI-010 Profile / account dropdown
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { API_ORIGIN } from "~/lib/config";
import { POLICIES } from "~/lib/cache/policies";
import { fetchViewer, hasSessionCookie, type Viewer } from "~/lib/auth/session";

const getViewerOnServer = createServerFn({ method: "GET" }).handler(async (): Promise<Viewer | null> => {
  const cookie = getRequestHeader("cookie") ?? "";
  if (!hasSessionCookie(cookie)) return null;
  return fetchViewer(API_ORIGIN, cookie);
});

export const viewerQuery = queryOptions({
  queryKey: ["user", "viewer"] as const,
  queryFn: (): Promise<Viewer | null> => (typeof window === "undefined" ? getViewerOnServer() : fetchViewer("")),
  staleTime: 5 * 60_000,
  gcTime: POLICIES.user.gcTime,
  retry: false,
});

/** The signed-in reader, or null (also while unknown). */
export function useViewer(): Viewer | null {
  return useQuery(viewerQuery).data ?? null;
}
