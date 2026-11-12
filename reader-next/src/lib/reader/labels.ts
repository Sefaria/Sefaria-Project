/**
 * Labels the reader prints next to text: segment numbers, which books show them, and the link dot.
 *
 * Numbers are digits or Hebrew letters by the panel's label language (./label-language), with a per-segment exception in
 * `segmentNumberLang`. Section titles live in src/ui/TextSection/section-heading.ts.
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
 * Language of the numeral printed beside a segment when the panel's label language is not known: Hebrew panel → Hebrew;
 * English panel → English; bilingual → interface language. The reader passes the panel's label language instead
 * (./label-language); this is the fallback for a segment rendered on its own.
 */
export function numberLang(language: ContentLanguage, interfaceLang: InterfaceLang): LabelLang {
  if (language === "hebrew") return "he";
  if (language === "english") return "en";
  return interfaceLang === "hebrew" ? "he" : "en";
}

/**
 * Language of one segment's number. It is the panel's label language (`labelLang`), except for a segment that has no
 * translation text and shows its source alone:
 *  - a Hebrew (rtl) source alone in an English or bilingual panel is numbered in digits;
 *  - an English (ltr) source alone in a Hebrew panel is numbered in Hebrew letters.
 * The old client draws the number in the label language and then, with CSS, shows only these languages' spans on such a
 * segment, so where the two disagree it shows no number at all. That lost number is a bug not carried over: this reader
 * shows the number its CSS meant to show.
 */
export function segmentNumberLang(language: ContentLanguage, labelLang: LabelLang, sourceAloneDir?: "rtl" | "ltr"): LabelLang {
  if (sourceAloneDir === "rtl" && language !== "hebrew") return "en";
  if (sourceAloneDir === "ltr" && language === "hebrew") return "he";
  return labelLang;
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
