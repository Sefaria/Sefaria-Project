/**
 * What the book page's moderator tools forget after a write (carry-over R2, D-7): the version editor's save and delete, the index
 * editor's save (then Django's /admin/reset) and delete, and Add Section (Django's add-text editor).
 * - A write that stays on the page marks the book's queries stale and deletes their stored copies, then refetches only the versions
 *   list it shows (refetching every active match would wait on the whole catalog first).
 * - A write that leaves with a full page load does not touch memory (the load drops it): it deletes the stored copies, waiting at most
 *   EDITOR_LEAVE_WAIT_MS (forgetBeforeEditor), then leaves; a hanging disk or API never holds the reader on the page.
 */
import type { QueryClient } from "@tanstack/react-query";
import { forgetBeforeEditor, invalidateAfterWrite, type Write } from "~/lib/cache/invalidate";
import { bookVersionsQueryOptions } from "~/lib/versions/book-versions";

/** A version's flags were saved, or the version deleted: everything of the book is stale; the versions list is read again now. */
export async function afterVersionWrite(qc: QueryClient, title: string): Promise<void> {
  await invalidateAfterWrite(qc, { kind: "book", title }, { refetchType: "none" });
  await qc.refetchQueries({ queryKey: bookVersionsQueryOptions(title).queryKey, exact: true });
}

/** Delete the stored copies `writes` made wrong (bounded), then leave for `href` with a full page load. */
export async function leaveAfterWrite(writes: Write[], href: string, assign: (href: string) => void = (h) => window.location.assign(h)): Promise<void> {
  await forgetBeforeEditor(writes).catch(() => undefined);
  assign(href);
}

/** The writes an index save makes: the book under its old title and under its new one (a rename). */
export const indexWrites = (oldTitle: string, newTitle: string): Write[] =>
  oldTitle === newTitle ? [{ kind: "book", title: oldTitle }] : [{ kind: "book", title: oldTitle }, { kind: "book", title: newTitle }, { kind: "catalog" }];
