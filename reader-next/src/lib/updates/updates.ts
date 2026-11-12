/**
 * New Additions (`/updates`, the old UpdatesPanel.jsx inside templates/static/updates.html): the site's global notifications —
 * new texts, new versions and general announcements — newest first.
 *
 *  - The list: `GET /api/updates?page=<n>` (updates_api: ten a page). Public (read from the API's origin, like the library's other
 *    public lists); the first page is read with the page, the next ones as
 *    the reader scrolls near the end. A page shorter than ten is the last. (The old page stopped only when the API's total `count`
 *    was under ten, so at the end it kept asking for empty pages on every scroll: not ported.)
 *  - Moderators add one (`POST /api/updates`, `json=<{type, content}>`) and delete one (`DELETE /api/updates/<id>`), as on the old page.
 *
 * @feature LIB-022 New Additions to the Library page
 * @feature NTF-004 Global notifications and site updates
 */
import { infiniteQueryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN } from "~/lib/api/client";
import { deleteRequest, postForm, sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";
import type { NotificationRecord } from "~/lib/notifications/notifications";

export const UPDATES_PAGE_SIZE = 10;

export const updatesUrl = (page: number) => `/api/updates?page=${page}`;

interface UpdatesAnswer {
  updates?: NotificationRecord[];
}

/** The list, a page at a time (the server reads the first page through the API's own origin). */
export const updatesQuery = () =>
  infiniteQueryOptions({
    // read through Varnish like the library's lists; kept in memory only, fresh for a few minutes (the search class's policy)
    queryKey: ["updates"] as const,
    staleTime: POLICIES.search.staleTime,
    gcTime: POLICIES.search.gcTime,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }): Promise<NotificationRecord[]> => {
      // the API's origin on either side (the internal one on the server, the public one in the browser; "" is the page's own)
      const r = await fetch(SEFARIA_API_ORIGIN ? `${SEFARIA_API_ORIGIN}${updatesUrl(pageParam)}` : sameOrigin(updatesUrl(pageParam)), { signal });
      if (!r.ok) throw new Error(`updates: HTTP ${r.status}`);
      const data = (await r.json()) as UpdatesAnswer;
      return Array.isArray(data.updates) ? data.updates : [];
    },
    getNextPageParam: (last: NotificationRecord[], _pages: NotificationRecord[][], lastPage: number) => (last.length < UPDATES_PAGE_SIZE ? undefined : lastPage + 1),
  });

export type UpdateType = "index" | "version" | "general";

/** The moderators' form (the old NewUpdateForm). */
export interface UpdateDraft {
  type: UpdateType;
  index: string;
  version: string;
  language: "en" | "he";
  en: string;
  he: string;
}

/** The old form's checks, in its order and words; null when the draft can be sent. */
export function validateUpdate(d: UpdateDraft): string | null {
  if (d.type === "general") {
    if (!d.en || !d.he) return "Both Hebrew and English are required";
  } else if (!d.index) return "Index is required";
  if (d.type === "version" && (!d.version || !d.language)) return "Version is required";
  return null;
}

/** What the old form posted: `{type, content: {en, he[, index][, version, language]}}`, every field trimmed. */
export function updatePayload(d: UpdateDraft): { type: UpdateType; content: Record<string, string> } {
  const content: Record<string, string> = { en: d.en.trim(), he: d.he.trim() };
  if (d.type !== "general") content.index = d.index.trim();
  if (d.type === "version") {
    content.version = d.version.trim();
    content.language = d.language.trim();
  }
  return { type: d.type, content };
}

/** Add an update. Answers null when saved, else the old page's error line ("Error - <message>"). */
export async function postUpdate(payload: ReturnType<typeof updatePayload>): Promise<string | null> {
  const r = await postForm("/api/updates", new URLSearchParams({ json: JSON.stringify(payload) }));
  const data = r.data as { status?: string; error?: string };
  if (data.status === "ok") return null;
  if (r.networkError) return "Error - network error";
  return `Error - ${data.error ?? `HTTP ${r.status}`}`;
}

/** Delete an update; true when the server said ok. */
export async function deleteUpdate(id: string): Promise<boolean> {
  const r = await deleteRequest(`/api/updates/${encodeURIComponent(id)}`);
  return (r.data as { status?: string }).status === "ok";
}
