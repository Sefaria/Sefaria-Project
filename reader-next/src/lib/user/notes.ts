/**
 * The reader's private notes on a passage (the sidebar's Notes tool), as the old client (static/js/sefaria/sefaria.js
 * privateNotes / deleteNote; ConnectionsPanel.jsx AddNoteBox; server reader/views.py notes_api):
 *  - read: `GET /api/notes/<ref>?private=1` for each selected verse, combined (the old privateNotes per ref);
 *  - add / edit: `POST /api/notes/` with form field `json` = {text, refs, type: "note", public: false[, _id]} — the server
 *    collapses `refs` into one ranged ref and sets the owner;
 *  - delete: `DELETE /api/notes/<id>`.
 * Public notes are off on sefaria.org (related_api returns none), so only the reader's own private notes are shown.
 *
 * @feature CON-049 My notes for these refs
 * @feature USL-007 Note display
 */
import { queryOptions } from "@tanstack/react-query";
import { ensureCsrfToken } from "~/lib/auth/csrf";
import { postForm, sameOrigin } from "~/lib/auth/http";
import { POLICIES } from "~/lib/cache/policies";
import { refToUrl } from "~/lib/ref/url";

export interface Note {
  _id: string;
  text: string;
  public?: boolean;
  anchorRef?: string;
  owner?: number;
  ownerName?: string;
}

export const notesQuery = (uid: number | null, refs: readonly string[]) =>
  queryOptions({
    queryKey: ["user", "notes", uid, [...refs]] as const,
    queryFn: async ({ signal }): Promise<Note[]> => {
      const lists = await Promise.all(
        refs.map(async (ref) => {
          const r = await fetch(sameOrigin(`/api/notes/${refToUrl(ref)}?private=1`), { credentials: "same-origin", signal });
          if (!r.ok) return [];
          const data = (await r.json()) as Note[] | { error?: string };
          return Array.isArray(data) ? data : [];
        }),
      );
      return lists.flat();
    },
    enabled: uid !== null && refs.length > 0,
    staleTime: 30_000,
    gcTime: POLICIES.user.gcTime,
  });

/** Add a note on these verses, or (with `id`) change one. Resolves to the saved note; throws with the server's message. */
export async function saveNote(text: string, refs: readonly string[], id?: string): Promise<Note> {
  const note = { text, refs: [...refs], type: "note", public: false, ...(id ? { _id: id } : {}) };
  const res = await postForm("/api/notes/", new URLSearchParams({ json: JSON.stringify(note) }));
  const data = res.data as unknown as Note & { error?: string };
  if (!res.ok || data.error || !data._id) throw new Error(data.error ?? "Sorry, there was a problem saving your note.");
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const csrf = await ensureCsrfToken();
  const r = await fetch(sameOrigin(`/api/notes/${id}`), { method: "DELETE", credentials: "same-origin", headers: { "X-CSRFToken": csrf } });
  if (!r.ok) throw new Error(`Could not delete the note (HTTP ${r.status})`);
}
