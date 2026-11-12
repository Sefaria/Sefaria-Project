/**
 * Labels in a table of contents: the number of a section in each language, by the text's address type.
 * Ported from Sefaria.getSectionStringByAddressType (BOK-014).
 *
 * @feature BOK-014 Section numbering by address type
 */
import { addressToNumber, numberToAddress } from "~/lib/ref/address";
import { encodeHebrewDaf, encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";

export interface Bilingual {
  en: string;
  he: string;
}

/**
 * The label of the section at zero-based position `i` (plus the node's index offset):
 *  - Talmud: "2a", "2b", … and Hebrew dafs ("ב.", "ב:");
 *  - Folio: "2a"…"2d";
 *  - Year: 1241 + n in English and the Hebrew numeral with a gershayim;
 *  - anything else: n + 1 and its Hebrew numeral.
 */
export function sectionLabel(addressType: string | undefined, i: number, offset = 0): Bilingual {
  const section = i + offset;
  if (addressType === "Talmud" || addressType === "Folio") {
    const daf = numberToAddress(section + 1, addressType);
    return { en: daf, he: encodeHebrewDaf(daf) };
  }
  if (addressType === "Year") {
    const he = encodeHebrewNumeral(section + 1, { punctuation: false });
    return { en: String(section + 1241), he: `${he.slice(0, -1)}"${he.slice(-1)}` };
  }
  return { en: String(section + 1), he: encodeHebrewNumeral(section + 1, { punctuation: false }) };
}

/** Section names the old site translates ("Chapter" → "פרק") — the common ones; others stay as written. */
const HEBREW_TERMS: Record<string, string> = {
  Chapter: "פרק", Chapters: "פרקים", Section: "סעיף", Verse: "פסוק", Paragraph: "פסקה", Volume: "כרך", Daf: "דף", Page: "עמוד",
  Mishnah: "משנה", Halakhah: "הלכה", Siman: "סימן", Seif: "סעיף", Line: "שורה", Comment: "הערה", Folio: "דף", Part: "חלק",
  Introduction: "הקדמה", "Torah Portions": "פרשיות השבוע", Contents: "תוכן", Parasha: "פרשה", Portion: "פרשה",
};
export const hebrewTerm = (term: string): string => HEBREW_TERMS[term] ?? term;

export { addressToNumber };
