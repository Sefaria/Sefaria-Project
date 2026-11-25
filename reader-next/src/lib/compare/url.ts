/**
 * The version-diff page's address, read and written exactly as sefaria.org does (sefaria/urls_library.py, static/js/diff_page.jsx).
 *
 * Read: Django's pattern `^compare/?((?P<comp_ref>[^/]+)/)?((?P<lang>en|he)/)?((?P<v1>[^/]+)/)?(?P<v2>[^/]+)?$`, matched on the
 * decoded path, so its quirks are kept: a group before the last needs its trailing slash (`/compare/Genesis.1` makes "Genesis.1" the
 * second version, and shows an empty form; `/compare/Genesis.1/` is the ref), an escaped slash splits, and the versions' underscores
 * read as spaces (every one, so a version title with a real underscore cannot be named).
 *
 * Read, part two: sefaria.org's nginx merges repeated slashes (merge_slashes) before Django sees the path, so `/compare/Genesis_2//`
 * is read as `/compare/Genesis_2/` (VERIFIED 2026-11-04: live answers 200 with secRef "Genesis 2", the address bar keeping the "//").
 *
 * Write: the old page joins `/compare/<ref>/<lang>/<v1>/<v2>` with "/", collapses the first "//" of each pair left by an empty part,
 * and turns spaces into underscores (PageLoader.componentDidUpdate). An empty language can leave a doubled slash ("Load Next Chapter"
 * on `/compare/Genesis.1/` writes `/compare/Genesis_2//`): sefaria.org shows Genesis 2's form at that address; this client's router
 * collapses the slash (`/compare/Genesis_2/`), the same page.
 *
 * @feature LEG-010 Text version diff/compare tool (/compare)
 * @feature RTE-019 Version compare tool URL
 */

export type CompareLang = "en" | "he";

/** What Django hands the page: the ref as typed in the address, the language and the two version titles (spaces, not underscores). */
export interface CompareAddress {
  compRef: string | null;
  lang: CompareLang | null;
  v1: string | null;
  v2: string | null;
}

const PATTERN = /^\/compare\/?(?:([^/]+)\/)?(?:(en|he)\/)?(?:([^/]+)\/)?([^/]+)?$/;

const decode = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/**
 * The address of a path (as written: repeated slashes merged, as nginx does, then decoded, as Django's path_info is), or null when
 * Django's pattern does not match it (a 404 on sefaria.org).
 */
export function parseComparePath(pathname: string): CompareAddress | null {
  const m = PATTERN.exec(decode(pathname.replace(/\/{2,}/g, "/")));
  if (!m) return null;
  const versionOf = (v: string | undefined) => (v ? v.replace(/_/g, " ") : null);
  return { compRef: m[1] ?? null, lang: (m[2] as CompareLang | undefined) ?? null, v1: versionOf(m[3]), v2: versionOf(m[4]) };
}

/** The path the old page goes to when its form (or "Load Next Chapter") changes something. */
export function comparePath(s: { secRef: string | null; lang: string | null; v1: string | null; v2: string | null }): string {
  return ["/compare", s.secRef, s.lang, s.v1, s.v2]
    .map((p) => p ?? "")
    .join("/")
    .split("//")
    .join("/")
    .split(" ")
    .join("_");
}

/** Is this a path of the version-diff page (the first segment is exactly "compare")? */
export const isComparePath = (pathname: string) => /^\/compare(?:\/|$)/.test(pathname);
