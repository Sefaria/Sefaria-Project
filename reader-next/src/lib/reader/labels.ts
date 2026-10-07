/**
 * Labels the reader prints next to and above text: segment numbers and section titles.
 *
 * Rules from the old client (inv_03 §5.2): numbers are Arabic in English, Hebrew numerals in Hebrew; in a
 * bilingual panel they follow the interface language; short numeric titles are used for Tanakh, Mishnah,
 * Talmud, Tanaitic and Commentary books; other categories print the full section reference.
 *
 * @feature TXD-045 Segment numbers
 * @feature TXD-011 TXD-012 Section titles; TXD-047 link dot; TXT-019 TXT-020 TXT-021 no numbers for some books
 */
import type { InterfaceLang } from "~/lib/i18n/interface-lang";
import { encodeHebrewDaf, encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";
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

const SHORT_TITLE_CATEGORIES = new Set(["Tanakh", "Mishnah", "Talmud", "Tanaitic", "Commentary"]);

export interface SectionTitleInput {
  primaryCategory: string;
  /** Last address of the section (e.g. "4", "2a"). */
  address: string | undefined;
  addressType?: string;
  sectionRef: string;
  heSectionRef: string;
}

/** Title above a section, in both languages. */
export function sectionTitle(i: SectionTitleInput): { en: string; he: string; short: boolean } {
  const short = SHORT_TITLE_CATEGORIES.has(i.primaryCategory) && i.address !== undefined;
  if (!short) return { en: i.sectionRef, he: i.heSectionRef, short: false };
  const addr = i.address!;
  if (i.addressType === "Talmud") return { en: addr, he: encodeHebrewDaf(addr), short };
  // Multi-part addresses (commentary on a verse: "1:1") convert each part.
  const he = addr.split(":").map((part) => (/^\d+$/.test(part) && Number(part) > 0 ? encodeHebrewNumeral(Number(part)) : part)).join(":");
  return { en: addr, he, short };
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
