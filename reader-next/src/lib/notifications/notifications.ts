/**
 * The reader's notifications (`/notifications`, the old NotificationsPanel.jsx; reader/views.py notifications, `@login_required`).
 *
 *  - The list: `GET /api/notifications?page=<n>&scope=library` (notifications_api: ten a page, newest first, the Library's types —
 *    Django leaves the Voices ones, sheet and follow notifications, to the Voices site). The old page had page 0 from its server and
 *    asked for the next page as the reader scrolled near the end; a page shorter than ten is the last.
 *  - Read: every notification the page has loaded is marked read, `POST /api/notifications/read` with `notifications=<JSON ids>` and
 *    `scope=library` (notifications_read_api), which answers the reader's unread count.
 *  - Signed out the API answers 200 `{error}`: an empty list (the route sends a signed-out reader to sign in first, as Django did).
 *
 * Requests go to the page's own origin with the session cookie.
 *
 * @feature NTF-001 Notifications page
 * @feature NTF-003 Mark notifications read
 */
import { infiniteQueryOptions } from "@tanstack/react-query";
import { postForm, sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";

/** The Library's module name, the API's `scope` (Django's LIBRARY_MODULE). */
export const LIBRARY_SCOPE = "library";
/** notifications_api's default page size. */
export const NOTIFICATIONS_PAGE_SIZE = 10;

/** Bilingual HTML (a global notification's text, written by the moderators). */
export interface NotificationText {
  en?: string;
  he?: string;
}

/** One notification as `client_contents()` gives it; `content` depends on `type`. */
export interface NotificationRecord {
  _id: string;
  type: string;
  /** Epoch seconds. */
  date: number;
  read?: boolean;
  is_global?: boolean;
  global_id?: string;
  content: NotificationText & {
    /** index / version: the book's title. */
    index?: string;
    /** version: its title and language ("en" | "he"). */
    version?: string;
    language?: string;
    /** sheet publish / sheet like / follow / collection add: the other reader. */
    name?: string;
    profileUrl?: string;
    imageUrl?: string;
    sheet_id?: number;
    sheet_title?: string;
    summary?: string;
    follower?: number;
    is_already_following?: boolean;
    collection_slug?: string;
    collection_name?: string;
  };
}

interface NotificationsAnswer {
  notifications?: NotificationRecord[];
  page?: number;
  page_size?: number;
  count?: number;
  error?: string;
}

export const notificationsUrl = (page: number, scope = LIBRARY_SCOPE) => `/api/notifications?${new URLSearchParams({ page: String(page), scope })}`;

/** The list, a page at a time; the next page is asked for while the last was full. */
export const notificationsQuery = (uid: number | null) =>
  infiniteQueryOptions({
    queryKey: ["user", "notifications", uid] as const,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<NotificationRecord[]> => {
      const r = await fetch(sameOrigin(notificationsUrl(pageParam)), { credentials: "same-origin", signal });
      if (!r.ok) throw new Error(`notifications: HTTP ${r.status}`);
      const data = (await r.json()) as NotificationsAnswer;
      return Array.isArray(data.notifications) ? data.notifications : [];
    },
    getNextPageParam: (last, _pages, lastPage) => (last.length < NOTIFICATIONS_PAGE_SIZE ? undefined : lastPage + 1),
    enabled: uid !== null,
    staleTime: 0,
    gcTime: POLICIES.user.gcTime,
  });

/** The pages in order, without a notification seen twice (the old page filtered repeats by id as pages shifted). */
export function uniqueNotifications(pages: readonly (readonly NotificationRecord[])[]): NotificationRecord[] {
  const seen = new Set<string>();
  const out: NotificationRecord[] = [];
  for (const n of pages.flat()) {
    if (seen.has(n._id)) continue;
    seen.add(n._id);
    out.push(n);
  }
  return out;
}

/** A book's address as the old page wrote it ('/' + Sefaria.normRef(title): spaces to "_", then encodeURIComponent). */
export const bookHref = (title: string) => `/${encodeURIComponent(title.replace(/ /g, "_"))}`;

/** The ids of the loaded notifications not yet read, and not already sent (`sent`, kept by the page). */
export function unreadIds(items: readonly NotificationRecord[], sent: ReadonlySet<string>): string[] {
  return items.filter((n) => !n.read && !sent.has(n._id)).map((n) => n._id);
}

/** Mark these notifications read (the old markAsRead). Answers the reader's unread count, or null when the request failed. */
export async function markNotificationsRead(ids: readonly string[], scope = LIBRARY_SCOPE): Promise<number | null> {
  if (!ids.length) return null;
  const r = await postForm("/api/notifications/read", new URLSearchParams({ notifications: JSON.stringify(ids), scope }));
  const count = (r.data as { unreadCount?: unknown }).unreadCount;
  return r.ok && typeof count === "number" ? count : null;
}
