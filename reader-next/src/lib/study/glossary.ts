import { localList } from "./local-set";

/**
 * Words the reader marked for a gloss: every occurrence, in any text, is underlined and shows its dictionary meaning on
 * hover. Kept by consonants, so a word matches with or without vowels and cantillation.
 */
export const glossary = localList("sefaria-reader:glossary", []);

/** Hebrew vowels and cantillation, and punctuation around a word, removed: "בְּרֵאשִׁ֖ית," → "בראשית". */
export function glossKey(word: string): string {
  return word
    .normalize("NFC")
    .replace(/[֑-ׇ]/g, (c) => (c === "־" ? "" : c >= "א" ? c : ""))
    .replace(/[^\p{L}\p{N}'"״׳-]/gu, "")
    .replace(/^['"״׳-]+|['"״׳-]+$/g, "");
}

/** Words of a text node, with their offsets (letters, marks and in-word punctuation). */
export function wordsIn(text: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}'"״׳־]+/gu)) out.push({ word: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}
