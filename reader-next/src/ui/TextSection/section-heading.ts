/**
 * The heading above a section of text, in both languages, exactly as sefaria.org prints it (old TextRange title, built by
 * Sefaria.sectionString). VERIFIED on www.sefaria.org 2026-11-10:
 *  - Tanakh, Mishnah, Talmud, Tanaitic and Commentary: the section's own numbers, "23", "2a" / "ב׳ א", "1:1" / "א׳:א׳".
 *  - Other books: the section name and number, "Chapter 1" (Mishneh Torah), "Siman 1" (Shulchan Arukh); a complex book adds its
 *    nodes without the book's title, "Bereshit, Chapter 1" / "בראשית, א׳" (Zohar), "Part 1, Chapter 1" (Guide for the Perplexed),
 *    "Weekday, Shacharit, Preparatory Prayers, Modeh Ani" (Siddur Ashkenaz). The Hebrew has no section name (as there).
 *
 * @feature TXD-011 @feature TXD-012
 */
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";

const SHORT_TITLE_CATEGORIES = new Set(["Tanakh", "Mishnah", "Talmud", "Tanaitic", "Commentary"]);

export interface SectionHeadingInput {
  primaryCategory: string;
  /** The section's ref ("Zohar, Bereshit 1") and its Hebrew, when known (the API's heSectionRef). */
  sectionRef: string;
  heSectionRef?: string;
  indexTitle: string;
  heIndexTitle: string;
  /** The node's title for a complex book ("Zohar, Bereshit"); the index title otherwise. */
  book: string;
  isComplex: boolean;
  sectionNames: string[];
  /** The section's numbers ("1", "2a"), and the address type of each. */
  sections: string[];
  addressTypes: string[];
}

/** One address in Hebrew as the API's refs write it: "2a" → "ב׳ א", "12" → "י״ב". */
export function hebrewAddress(part: string, addressType?: string): string {
  const daf = /^(\d+)([abcd])$/.exec(part);
  if (daf && (addressType === "Talmud" || addressType === "Folio")) return `${encodeHebrewNumeral(Number(daf[1]))} ${"אבגד"["abcd".indexOf(daf[2]!)]}`;
  return /^\d+$/.test(part) && Number(part) > 0 ? encodeHebrewNumeral(Number(part)) : part;
}

const after = (s: string, prefix: string) => (s.startsWith(prefix) ? s.slice(prefix.length) : s).replace(/^[,\s]+/, "").trim();
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export function sectionHeading(i: SectionHeadingInput): { en: string; he: string } {
  const numberedEn = i.sections.join(":");
  const numberedHe = i.sections.map((p, n) => hebrewAddress(p, i.addressTypes[n])).join(":");
  // the Hebrew of the section's ref: the API's when known, else the book's Hebrew title and the numbers
  const heRef = i.heSectionRef ?? squash(`${i.heIndexTitle} ${numberedHe}`);
  const sectionsEn = after(i.sectionRef, i.indexTitle);
  const sectionsHe = after(heRef, i.heIndexTitle);
  if (SHORT_TITLE_CATEGORIES.has(i.primaryCategory)) return { en: sectionsEn, he: sectionsHe };
  const name = i.sectionNames.length > 1 ? `${i.sectionNames[0]} ` : "";
  if (!i.isComplex) return { en: squash(name + sectionsEn), he: sectionsHe };
  // a complex book: the nodes between the book's title and the numbers, then the section name and the numbers
  if (!numberedEn) return { en: sectionsEn, he: sectionsHe };
  const namedEn = after(i.sectionRef.slice(0, i.sectionRef.length - numberedEn.length), i.indexTitle).replace(/[,\s]+$/, "");
  const heEnds = sectionsHe.endsWith(numberedHe);
  const namedHe = heEnds ? sectionsHe.slice(0, sectionsHe.length - numberedHe.length).replace(/[,\s]+$/, "") : "";
  return {
    en: squash(`${namedEn ? `${namedEn}, ` : ""}${name}${numberedEn}`),
    he: heEnds ? squash(`${namedHe ? `${namedHe}, ` : ""}${numberedHe}`) : sectionsHe,
  };
}
