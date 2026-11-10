/**
 * After a write, forget what it made wrong: in memory (the queries are invalidated, so what is on screen refetches) and on disk (the
 * stored copies are deleted, so a reload or another tab never paints the old answer for up to the class's 30 days). D-7, LAUNCH_PLAN
 * T-E01.
 *
 * Two ways in:
 * - a write this client makes (`invalidateAfterWrite`): link add/remove, a topic link, a lexicon edit, version flags, notes;
 * - a return from one of Django's editors (`/edit/…`, `/translate/…`, `/add/…`, `/admin/reset/…`), which come back through `?next=`
 *   with a full page load: `invalidateAfterEditorReturn` reads the page's referrer once at start-up; the writes inside the editor are
 *   Django's own, so the reader learns of them only that way. Callers that send the reader to an editor also call `forgetBeforeEditor`,
 *   so a referrer the browser withholds still leaves no stale copy on disk.
 *
 * Scopes are coarse on purpose (a whole book's text for one edited verse): an edit is rare, a refetch through Varnish is cheap, and the
 * client never takes a ref apart beyond its title to decide what is "the same text" (wiki ref-resolution.md).
 */
import { partialMatchKey, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { SITE_ORIGIN } from "~/lib/config";
import { parseHumanRef, urlToRef } from "~/lib/ref/url";
import { removeDiskKeysWhere } from "./storage";

export type Write =
  /** A text was edited, translated or added (Django's editors, Compare's Apply Change): the book's texts and its versions list. */
  | { kind: "text"; ref: string }
  /** A book's index or versions changed (version flags, metadata, index editor, `/admin/reset/<title>`). */
  | { kind: "book"; title: string }
  /** A connection was added or removed. */
  | { kind: "links" }
  /** A topic was linked to a ref (or unlinked), or a topic was edited. */
  | { kind: "topic"; slug?: string }
  /** A dictionary entry was edited. */
  | { kind: "lexicon" }
  /** The library's table of contents or every index (admin resets of the TOC, the whole cache, all counts). */
  | { kind: "catalog" }
  /** The reader's notes changed. */
  | { kind: "notes" };

/** Which query keys a write makes wrong. */
export type KeyMatch = (key: readonly unknown[]) => boolean;

/** The book a ref belongs to, as far as invalidation needs: the title before any node name ("Pesach Haggadah, Kadesh 3" → "Pesach Haggadah"). */
export function bookOf(ref: string): string {
  return parseHumanRef(ref).title.split(",")[0]!.trim();
}

/** A ref string that names `book` or something inside it. Over-matches a longer title that starts the same ("Genesis Rabbah"): harmless. */
const inBook = (book: string) => (s: unknown) => typeof s === "string" && (s === book || s.startsWith(`${book} `) || s.startsWith(`${book},`) || s.startsWith(`${book}:`));

const prefix = (p: QueryKey): KeyMatch => (key) => partialMatchKey(key as QueryKey, p);

export function matchersFor(write: Write): KeyMatch[] {
  switch (write.kind) {
    case "text": {
      const book = inBook(bookOf(write.ref));
      return [
        (k) => k[0] === "text" && book(k[1]),
        (k) => k[0] === "compare" && k[1] === "text" && book(k[2]),
        (k) => (k[0] === "versions" || k[0] === "translations") && book(k[1]),
        // a new version changes the book's versions list and its page
        (k) => k[0] === "catalog" && (k[1] === "index-details" || k[1] === "index") && book(k[2]),
        ...matchersFor({ kind: "links" }), // a text edit can add or move auto-links (commentary)
      ];
    }
    case "book": {
      const book = inBook(write.title);
      return [
        (k) => k[0] === "text" && book(k[1]),
        (k) => (k[0] === "versions" || k[0] === "translations") && book(k[1]),
        (k) => k[0] === "catalog" && book(k[2]),
        prefix(["catalog", "toc"]),
      ];
    }
    case "links":
      return [prefix(["links"]), prefix(["resources"])];
    case "topic":
      // the sidebar's own Topics list is patched in place by the caller (addLinkToResources): refetching /api/related for it would
      // download the section's links again (SB-03)
      return write.slug ? [prefix(["topics", "topic", write.slug]), prefix(["topics", "page", write.slug])] : [prefix(["topics"])];
    case "catalog":
      return [prefix(["catalog"]), prefix(["versions"])];
    case "lexicon":
      return [prefix(["lexicon"]), prefix(["lexicon-completion"]), prefix(["user", "lexicon-entry"])];
    case "notes":
      return [prefix(["user", "notes"]), prefix(["user", "all-notes"])];
  }
}

/** The query key stored under a disk key (`sr-<class>-<queryHash>`), or undefined for a key of another shape. */
export function keyOfDiskEntry(diskKey: string): unknown[] | undefined {
  const m = /^sr-[a-z]+-(.*)$/s.exec(diskKey);
  if (!m) return undefined;
  try {
    const key = JSON.parse(m[1]!) as unknown;
    return Array.isArray(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

const anyOf = (matchers: KeyMatch[]): KeyMatch => (key) => matchers.some((m) => m(key));

/** Writes whose queries are all memory-only (connections, user): nothing on disk to scan for. */
const MEMORY_ONLY: ReadonlySet<Write["kind"]> = new Set(["links", "notes"]);

/** Delete the stored copies a write made wrong. Never throws, never waits past the disk timeout (storage.ts onDisk). */
export async function forgetOnDisk(write: Write | Write[]): Promise<number> {
  const writes = [write].flat().filter((w) => !MEMORY_ONLY.has(w.kind));
  if (!writes.length) return 0;
  const match = anyOf(writes.flatMap(matchersFor));
  return removeDiskKeysWhere((diskKey) => {
    const key = keyOfDiskEntry(diskKey);
    return !!key && match(key);
  }).catch(() => 0);
}

/**
 * Disk deletions started at page start-up, which a disk read must wait for (persisters.ts): otherwise the first section restored
 * after a return from an editor could be the very copy being deleted.
 */
let pending: Promise<unknown> = Promise.resolve();
export const pendingDiskInvalidation = (): Promise<unknown> => pending;

/**
 * Invalidate in memory first (active queries refetch now, the rest when next used), then delete from disk behind it: a slow or
 * hanging disk never holds up the write's caller (review: a hanging IndexedDB froze link edits).
 */
export async function invalidateAfterWrite(qc: QueryClient, write: Write | Write[], opts: { refetchType?: "active" | "none" } = {}): Promise<void> {
  const match = anyOf([write].flat().flatMap(matchersFor));
  const disk = forgetOnDisk(write);
  pending = Promise.all([pending, disk]);
  // `refetchType: "none"`: mark stale only (a caller that refetches what it shows itself, and no more)
  await qc.invalidateQueries({ predicate: (q) => match(q.queryKey as readonly unknown[]), refetchType: opts.refetchType ?? "active" });
}

/** How long leaving for an editor may wait for the disk. */
export const EDITOR_LEAVE_WAIT_MS = 300;

/**
 * Call right before sending the reader to a Django editor that will come back with `?next=` (a full page load): resolves when the
 * stored copies are gone, or after EDITOR_LEAVE_WAIT_MS, whichever is first (the referrer check on return covers the rest).
 */
export function forgetBeforeEditor(write: Write | Write[]): Promise<void> {
  return Promise.race([forgetOnDisk(write).then(() => undefined), new Promise<void>((r) => setTimeout(r, EDITOR_LEAVE_WAIT_MS))]);
}

/**
 * Django's editors and admin resets, which return to the reader through `?next=`, and what each one changes
 * (sefaria/urls_library.py: add/textinfo, add, translate, edit; sefaria/urls_shared.py: admin/reset/…). `origins`: where Django
 * serves them (the site origin and this page's own). Limit: a cross-origin referrer arrives as its origin only (the browsers' default
 * strict-origin-when-cross-origin policy), so a return from an editor on another origin cannot be recognised here; the client's own
 * editor links cover that case (forgetBeforeEditor).
 */
export function writeFromEditorUrl(url: string, origins: string | readonly string[]): Write | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (![origins].flat().filter(Boolean).includes(u.origin)) return undefined;
  const path = u.pathname;
  const book = (m: RegExpExecArray | null): Write | undefined => {
    const title = m?.[1] && urlToRef(m[1]);
    return title ? { kind: "book", title } : undefined;
  };
  const text = (m: RegExpExecArray | null): Write | undefined => {
    const ref = m?.[1] && urlToRef(m[1]);
    return ref ? { kind: "text", ref } : undefined;
  };
  if (/^\/admin\/reset\/(toc|cache|counts\/all)\/?$/.test(path)) return { kind: "catalog" };
  if (/^\/admin\/reset\/(ac|linker-resolvers|api\/)/.test(path)) return undefined;
  if (/^\/(edit|add)\/terms\//.test(path) || /^\/add\/new\/?$/.test(path)) return undefined;
  return (
    book(/^\/add\/textinfo\/([^?#]+)$/.exec(path)) ??
    book(/^\/admin\/reset\/(?:cache|counts)\/([^/?#]+)$/.exec(path)) ??
    text(/^\/admin\/reset\/varnish\/([^/?#]+)$/.exec(path)) ??
    text(/^\/admin\/reset\/([^/?#]+)$/.exec(path)) ??
    text(/^\/(?:edit|translate|add)\/([^/?#]+)/.exec(path))
  );
}

/**
 * Once, at start-up in the browser: a page reached from a Django editor forgets on disk what the editor changed. Memory is empty on
 * a full page load, and what the server rendered was fetched after the edit, so the disk is all there is to correct. Only on a
 * navigation: a reload or Back keeps the same referrer, and must not repeat the deletion.
 */
export function invalidateAfterEditorReturn(
  doc: { referrer: string; location: { origin: string } } | undefined = typeof document === "undefined" ? undefined : document,
  o: { siteOrigin?: string; navigationType?: string } = {},
): Write | undefined {
  if (!doc?.referrer) return undefined;
  const navigationType = o.navigationType ?? currentNavigationType();
  if (navigationType && navigationType !== "navigate") return undefined;
  const write = writeFromEditorUrl(doc.referrer, [o.siteOrigin ?? SITE_ORIGIN, doc.location.origin]);
  if (write) pending = Promise.all([pending, forgetOnDisk(write)]);
  return write;
}

/** "navigate", "reload", "back_forward" (Navigation Timing), or undefined where the browser does not say. */
function currentNavigationType(): string | undefined {
  try {
    return (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
  } catch {
    return undefined;
  }
}
