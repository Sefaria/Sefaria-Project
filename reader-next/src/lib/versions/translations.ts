/**
 * The Translations sidebar's data: every translation of the selected passage, with its text, grouped by
 * language. Ported from the old TranslationsBox / VersionsBlocksList / Sefaria._sortVersionsIntoBuckets.
 *
 * VERIFIED on sefaria.org (2026-10-05, Genesis 1:1): languages ordered by code with English first
 * (en, de, eo, es, …), English (14). The language comes from a "[xx]" suffix on the version title, else the
 * version's `language` field — not the API's `actualLanguage`, which disagrees for a few versions.
 *
 * @feature VER-009 Translations sidebar list
 * @feature VER-010 Translation preview with truncation
 * @feature VER-011 Translation details disclosure and Open Text
 */
import { queryOptions } from "@tanstack/react-query";
import { text } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface TranslationVersion {
  versionTitle: string;
  versionTitleInHebrew?: string;
  shortVersionTitle?: string;
  shortVersionTitleInHebrew?: string;
  language: string;
  languageFamilyName: string;
  direction?: "rtl" | "ltr";
  isSource?: boolean;
  versionSource?: string;
  digitizedBySefaria?: boolean;
  license?: string;
  purchaseInformationURL?: string;
  /** The passage in this version: a string for one segment, nested arrays for more. */
  text: unknown;
}

/** Old `_sortVersionsIntoBuckets`: "[de]" suffix wins, else `language`. */
export const bucketLanguage = (v: Pick<TranslationVersion, "versionTitle" | "language">): string =>
  /\[([a-z]{2,3})\]$/.exec(v.versionTitle)?.[1] ?? v.language;

export function bucketTranslations(versions: readonly TranslationVersion[]): Record<string, TranslationVersion[]> {
  const out: Record<string, TranslationVersion[]> = {};
  for (const v of versions) (out[bucketLanguage(v)] ??= []).push(v);
  return out;
}

/** Old VersionsBlocksList.sortVersions: the prioritised language first, then by code. */
export const orderLanguages = (langs: readonly string[], prioritize = "en"): string[] =>
  [...langs].sort((a, b) => (a === prioritize ? -1 : b === prioritize ? 1 : a < b ? -1 : a > b ? 1 : 0));

/** The current translation first within its language (Hebrew is never reordered, as before). */
export function currentFirst(bucket: readonly TranslationVersion[], lang: string, currentTitle: string | undefined): TranslationVersion[] {
  if (!currentTitle || lang === "he") return [...bucket];
  return [...bucket].sort((a, b) => (a.versionTitle === currentTitle ? -1 : b.versionTitle === currentTitle ? 1 : 0));
}

/** The key the sidebar uses for a previewed version: "<title>|<language>" (old getTranslateVersionsKey). */
export const versionKey = (v: Pick<TranslationVersion, "versionTitle" | "language">): string => `${v.versionTitle}|${v.language}`;

/** Both forms occur in URLs: "Title|en" (written by the old app) and "Title" (its link hrefs). */
export function parseVersionKey(key: string | undefined): { title: string; lang?: string } | undefined {
  if (!key) return undefined;
  const m = /^(.*)\|([a-z]{2,3})$/.exec(key);
  return m ? { title: m[1]!, lang: m[2]! } : { title: key };
}

/** The passage's text in a version, as one HTML string (segments joined by spaces). */
export function previewHtml(t: unknown): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map(previewHtml).filter(Boolean).join(" ");
  return "";
}

const LICENSES: Record<string, string> = {
  "Public Domain": "https://en.wikipedia.org/wiki/Public_domain",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY-SA": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC-BY-NC": "https://creativecommons.org/licenses/by-nc/4.0/",
  "CC-BY-NC-ND": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
};
/** Old Sefaria.getLicenseMap. */
export const licenseUrl = (license: string | undefined): string | undefined => (license ? LICENSES[license] : undefined);

/** Language name for a code, in the interface language ("de" → "German" / "גרמנית"). */
export function languageName(code: string, interfaceLang: "english" | "hebrew"): string {
  try {
    const name = new Intl.DisplayNames([interfaceLang === "hebrew" ? "he" : "en"], { type: "language" }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

export const allTranslationsQueryOptions = (ref: string) =>
  queryOptions<TranslationVersion[]>({
    ...withPolicy("text", {
      queryKey: ["translations", ref] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        // As the old client asks: every translation, without filling gaps from other versions.
        const r = await text.getV3Texts({ client: getSefariaClient(), path: { tref: ref }, query: { version: ["translation|all"], fill_in_missing_segments: "0" }, signal });
        return ((unwrap(r, `Translations of ${ref}`) as unknown as { versions: TranslationVersion[] }).versions ?? []).filter((v) => !v.isSource);
      },
    }),
  });
