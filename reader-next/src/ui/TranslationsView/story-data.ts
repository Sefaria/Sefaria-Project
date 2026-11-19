import raw from "../../../fixtures/api/genesis-1/v3-translations-all-1-1.json";
import { bucketTranslations, currentFirst, languageName, orderLanguages, type TranslationVersion } from "~/lib/versions/translations";
import type { TranslationLanguage } from "./TranslationsView";

/** Every translation of Genesis 1:1, as recorded from the API, grouped like the sidebar shows them. */
export function storyLanguages(currentTitle?: string, interfaceLang: "english" | "hebrew" = "english"): TranslationLanguage[] {
  const buckets = bucketTranslations((raw as { versions: TranslationVersion[] }).versions.filter((v) => !v.isSource));
  return orderLanguages(Object.keys(buckets)).map((code) => ({ code, name: languageName(code, interfaceLang), versions: currentFirst(buckets[code]!, code, currentTitle) }));
}
export const CURRENT = "THE JPS TANAKH: Gender-Sensitive Edition";
