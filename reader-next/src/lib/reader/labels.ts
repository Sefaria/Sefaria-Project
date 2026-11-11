/**
 * Labels the reader prints next to text: segment numbers, which books show them, and the link dot.
 *
 * Rules from the old client (inv_03 §5.2): numbers are Arabic in English, Hebrew numerals in Hebrew; in a
 * bilingual panel they follow the interface language. Section titles live in src/ui/TextSection/section-heading.ts.
 *
 * @feature TXD-045 Segment numbers
 * @feature TXD-047 link dot; TXT-019 TXT-020 TXT-021 no numbers for some books
 */
import type { InterfaceLang } from "~/lib/i18n/interface-lang";
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";
import type { ContentLanguage } from "./settings";

export type LabelLang = "en" | "he";

/** Which sides of a segment are visible. */
export interface VisibleSides {
  primary: boolean;
  translation: boolean;
}

/** Primary shows unless English-only (and a translation exists); translation shows unless Hebrew-only (and a primary exists). */
export function visibleSides(language: ContentLanguage, has: { primary: boolean; translation: boolean }): VisibleSides {
  return {
    primary: has.primary && (language !== "english" || !has.translation),
    translation: has.translation && (language !== "hebrew" || !has.primary),
  };
}

/**
 * Language of the numeral printed beside a segment.
 *  - Hebrew panel → Hebrew; English panel → English; bilingual → interface language
 *  - except: a segment with only an English (LTR) side in a Hebrew panel shows Hebrew, and a Hebrew-only
 *    (RTL) segment in an English/bilingual panel shows English.
 */
export function numberLang(language: ContentLanguage, interfaceLang: InterfaceLang): LabelLang {
  if (language === "hebrew") return "he";
  if (language === "english") return "en";
  return interfaceLang === "hebrew" ? "he" : "en";
}

/** A segment's number in the margin: Hebrew letters without geresh/gershayim (VERIFIED on sefaria.org: Psalms 119 runs א … קיט). */
export function segmentNumber(address: string, lang: LabelLang): string {
  if (lang === "he" && /^\d+$/.test(address) && Number(address) > 0) return encodeHebrewNumeral(Number(address), { punctuation: false });
  return address;
}

/** Segments are numbered unless the book is a dictionary, liturgy, or the Guide for the Perplexed. */
export function showsSegmentNumbers(book: string, categories: string[]): boolean {
  if (book.startsWith("Guide for the Perplexed")) return false;
  const top = categories[0];
  return top !== "Liturgy" && top !== "Reference";
}

/** Opacity of the link-count dot: 0 for none, then min(count + 20, 70) / 100. */
export function linkDotOpacity(count: number): number {
  return count > 0 ? Math.min(count + 20, 70) / 100 : 0;
}
