/**
 * The library home's Recently Viewed (the old NavSidebar RecentlyViewed): the reader's history as `GET /api/profile/user_history`
 * gives it (signed in: the profile's; signed out: the `user_history` cookie, which the server reads), the newest item of each of the
 * first three books, sheets left out. The old page had the history in its props (server-rendered); here the server asks for it with
 * the reader's own cookies when there is a session or a history cookie, so the module is in the first paint and never pushes the
 * sidebar down after load. VERIFIED on www.sefaria.org 2026-11-10 (Playwright, a user_history cookie of six items: Genesis 1:3,
 * Berakhot 2a, Exodus 3; Genesis 2 and a sheet left out).
 *
 * @feature LIB-025 Sidebar module: Recently viewed
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { API_ORIGIN } from "~/lib/config";
import { POLICIES } from "~/lib/cache/policies";
import { sameOrigin } from "~/lib/auth/http";
import { hasSessionCookie } from "~/lib/auth/session";

export interface RecentItem {
  ref: string;
  he_ref?: string;
  book?: string;
  versions?: Partial<Record<"en" | "he", { versionTitle?: string; languageFamilyName?: string } | string | null>>;
}

/** Sefaria.loadUserHistory(20): the first page of the history, sheets included (the module filters). */
export const RECENT_HISTORY_PATH = "/api/profile/user_history?secondary=0&annotate=1&limit=20&skip=0&saved=0&sheets_only=0";

const hasHistoryCookie = (cookie: string) => /(?:^|;\s*)user_history=/.test(cookie);

async function fetchHistory(url: string, init: RequestInit): Promise<RecentItem[]> {
  try {
    const r = await fetch(url, init);
    if (!r.ok) return [];
    const data = (await r.json()) as unknown;
    return Array.isArray(data) ? (data as RecentItem[]) : [];
  } catch {
    return [];
  }
}

const historyOnServer = createServerFn({ method: "GET" }).handler(async (): Promise<RecentItem[]> => {
  const cookie = getRequestHeader("cookie") ?? "";
  if (!hasSessionCookie(cookie) && !hasHistoryCookie(cookie)) return [];
  return fetchHistory(`${API_ORIGIN}${RECENT_HISTORY_PATH}`, { headers: { cookie, accept: "application/json" } });
});

/** The old filterRecentlyViewedItems: the first item of each book, no sheets, three at most. */
export function pickRecentlyViewed(items: readonly RecentItem[]): RecentItem[] {
  const books = new Set<string | undefined>();
  const out: RecentItem[] = [];
  for (const x of items) {
    if (x.book === "Sheet" || books.has(x.book)) continue;
    books.add(x.book);
    out.push(x);
  }
  return out.slice(0, 3);
}

/** Keyed by who is reading (uid, or null signed out): a sign-in or sign-out is a full page load anyway. */
export const recentlyViewedQuery = (uid: number | null) =>
  queryOptions({
    queryKey: ["user", "recently-viewed", uid] as const,
    queryFn: (): Promise<RecentItem[]> =>
      typeof window === "undefined" ? historyOnServer() : fetchHistory(sameOrigin(RECENT_HISTORY_PATH), { credentials: "same-origin", headers: { accept: "application/json" } }),
    staleTime: 60_000,
    gcTime: POLICIES.user.gcTime,
  });

/** For the library home's loader: the viewer first (the key is theirs), then the history; never fails the page. */
export async function recentlyViewed(qc: QueryClient, viewer: Promise<{ id?: number } | null>): Promise<unknown> {
  const v = await viewer.catch(() => null);
  return qc.ensureQueryData(recentlyViewedQuery(v?.id ?? null)).catch(() => []);
}
