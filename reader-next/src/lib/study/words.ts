/** Words of a text node, with their offsets (letters, marks and in-word punctuation such as gershayim and maqaf). */
export function wordsIn(text: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}'"״׳־]+/gu)) {
    const lead = m[0].length - m[0].replace(/^['"״׳־]+/, "").length;
    const word = m[0].slice(lead).replace(/['"״׳־]+$/, "");
    if (/\p{L}/u.test(word)) out.push({ word, start: m.index! + lead, end: m.index! + lead + word.length });
  }
  return out;
}
