import type { VersionMeta } from "~/lib/text/model";
import { bucketLanguage } from "~/lib/versions/translations";

/** A version as the book page lists it: the versions API also says where each version's text starts. */
export type BookVersion = VersionMeta & { firstSectionRef?: string };

/** Only real version records: the versions API answers an unknown title with `{ error }`, not a list. */
export const versionRecords = (versions: readonly unknown[] | undefined): BookVersion[] =>
  (Array.isArray(versions) ? versions : []).filter((v): v is BookVersion => !!v && typeof v === "object" && typeof (v as BookVersion).versionTitle === "string");

/**
 * The book page's order (the old VersionsList): the versions grouped by language as the old client stored them (a "[de]" title
 * suffix, else `language`, in the order the API lists them), then sorted by priority, highest first, then by version title in code-unit
 * order (the English `versionTitle`, also in the Hebrew interface). The comparison is the old one, value for value: `priority` is ""
 * for most versions and a number for some, and JavaScript's `>` between them is what decided the order there.
 */
export function bookVersionOrder(versions: readonly BookVersion[]): BookVersion[] {
  const buckets = new Map<string, BookVersion[]>();
  for (const v of versions) {
    const k = bucketLanguage(v);
    buckets.set(k, [...(buckets.get(k) ?? []), v]);
  }
  const gt = (a: unknown, b: unknown) => (a as number) > (b as number);
  return [...buckets.values()].flat().sort((a, b) => {
    if (gt(a.priority, b.priority)) return -1;
    if (gt(b.priority, a.priority)) return 1;
    if (a.versionTitle < b.versionTitle) return -1;
    if (a.versionTitle > b.versionTitle) return 1;
    return 0;
  });
}

/**
 * The language a version is in, for its badge: a "[xx]" title suffix first, as the old client read it (the API's `actualLanguage`
 * is wrong for some suffixed ones: Genesis' "Tora ve Aftara [tr]" says "en"), else the version's `actualLanguage`, else `language`
 * (the old client fell back to `language`, which is "en" for every translation; no current version differs between the two).
 */
export const versionLanguage = (v: Pick<BookVersion, "versionTitle" | "language" | "actualLanguage">): string =>
  /\[([a-z]{2,3})\]$/.exec(v.versionTitle)?.[1] ?? (v.actualLanguage || v.language);
