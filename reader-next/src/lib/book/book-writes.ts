/**
 * What the book page's moderator tools forget after a write (carry-over R2, D-7): the version editor's save and delete, the index
 * editor's save (then Django's /admin/reset) and delete, and Add Section (Django's add-text editor). A write that stays on the page
 * invalidates in memory and on disk; one that leaves with a full page load first waits for the disk (forgetBeforeEditor), or the
 * next page would paint the old book from IndexedDB.
 */
import type { QueryClient } from "@tanstack/react-query";
import { forgetBeforeEditor, invalidateAfterWrite, type Write } from "~/lib/cache/invalidate";

/** A version's flags were saved, or the version deleted: the book's versions, texts and page are read again. */
export const afterVersionWrite = (qc: QueryClient, title: string) => invalidateAfterWrite(qc, { kind: "book", title });

/** Forget `writes` in memory and on disk, then leave for `href` with a full page load (`assign`: window.location.assign). */
export async function leaveAfterWrite(qc: QueryClient | null, writes: Write[], href: string, assign: (href: string) => void = (h) => window.location.assign(h)): Promise<void> {
  if (qc) await invalidateAfterWrite(qc, writes).catch(() => undefined);
  await forgetBeforeEditor(writes).catch(() => undefined);
  assign(href);
}

/** The writes an index save makes: the book under its old title and under its new one (a rename). */
export const indexWrites = (oldTitle: string, newTitle: string): Write[] =>
  oldTitle === newTitle ? [{ kind: "book", title: oldTitle }] : [{ kind: "book", title: oldTitle }, { kind: "book", title: newTitle }, { kind: "catalog" }];
