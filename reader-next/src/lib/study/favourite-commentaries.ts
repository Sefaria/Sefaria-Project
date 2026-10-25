import type { RelatedLink } from "~/lib/connections/links";
import { localList } from "./local-set";

/** The commentators the reader reaches for first (collective titles, e.g. "Rashi"), in their order. */
export const favouriteCommentaries = localList("sefaria-reader:favourite-commentaries", ["Rashi", "Tosafot", "Ramban"]);

export interface CommentaryOnVerse {
  /** "Rashi" */
  name: string;
  heName?: string;
  /** "Rashi on Genesis" */
  book: string;
  /** The first comment on the verse. */
  ref: string;
  favourite: boolean;
}

/** Commentaries with something on `segmentRef`: favourites first in the reader's order, then the rest by the server's order. */
export function commentariesOn(links: readonly RelatedLink[], segmentRef: string, favourites: readonly string[]): CommentaryOnVerse[] {
  const byName = new Map<string, CommentaryOnVerse>();
  for (const l of links) {
    if (l.category !== "Commentary" || !l.anchorRefExpanded.includes(segmentRef)) continue;
    const name = l.collectiveTitle?.en || l.index_title;
    if (!byName.has(name)) byName.set(name, { name, heName: l.collectiveTitle?.he, book: l.index_title, ref: l.sourceRef, favourite: favourites.includes(name) });
  }
  const all = [...byName.values()];
  const rank = (c: CommentaryOnVerse) => (c.favourite ? favourites.indexOf(c.name) : favourites.length);
  return all.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(({ c }) => c);
}
