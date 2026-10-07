/**
 * Hebrew numerals (gematria) used for chapter, verse, daf and segment labels.
 * @feature TXD-065 Hebrew numeral and daf encoding
 */

const GERESH = "׳";
const GERSHAYIM = "״";

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

const LETTER_VALUES: Record<string, number> = {};
ONES.forEach((l, i) => l && (LETTER_VALUES[l] = i));
TENS.forEach((l, i) => l && (LETTER_VALUES[l] = i * 10));
["ק", "ר", "ש", "ת"].forEach((l, i) => (LETTER_VALUES[l] = (i + 1) * 100));
Object.assign(LETTER_VALUES, { ך: 20, ם: 40, ן: 50, ף: 80, ץ: 90 });

/** Letters for 1..999 without punctuation. 15 and 16 avoid spelling divine names (ט״ו, ט״ז). */
function encodeBelowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = HUNDREDS[h] ?? "";
  if (rest === 15) return out + "טו";
  if (rest === 16) return out + "טז";
  out += TENS[Math.floor(rest / 10)] ?? "";
  out += ONES[rest % 10] ?? "";
  return out;
}

function punctuate(letters: string): string {
  if (letters.length === 0) return letters;
  if (letters.length === 1) return letters + GERESH;
  return letters.slice(0, -1) + GERSHAYIM + letters.slice(-1);
}

/**
 * Encode a positive integer as a Hebrew numeral.
 * - `punctuation: true` (default) adds geresh/gershayim: 1 → א׳, 15 → ט״ו, 613 → תרי״ג.
 * - Thousands are written as a letter followed by geresh: 5786 → ה׳תשפ״ו.
 */
export function encodeHebrewNumeral(n: number, { punctuation = true } = {}): string {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError(`Cannot encode ${n} as a Hebrew numeral`);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const restLetters = encodeBelowThousand(rest);
  const restOut = punctuation ? punctuate(restLetters) : restLetters;
  if (!thousands) return restOut;
  return encodeBelowThousand(thousands) + GERESH + restOut;
}

/** Decode a Hebrew numeral (punctuation ignored). Returns NaN for strings with non-numeral letters. */
export function decodeHebrewNumeral(s: string): number {
  const clean = s.replace(/[׳״'"]/g, "");
  let total = 0;
  for (const ch of clean) {
    const v = LETTER_VALUES[ch];
    if (v === undefined) return NaN;
    total += v;
  }
  return total;
}

/** Daf label in Hebrew: "2a" → "ב.", "2b" → "ב:" (the convention used in printed Talmud citations). */
export function encodeHebrewDaf(daf: string, { punctuation = false } = {}): string {
  const m = /^(\d+)([ab])$/.exec(daf);
  if (!m) return daf;
  return encodeHebrewNumeral(Number(m[1]), { punctuation }) + (m[2] === "a" ? "." : ":");
}
