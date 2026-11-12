/**
 * Address arithmetic for Sefaria address types.
 * - Talmud: "2a" → "2b" → "3a" (two amudim per daf)
 * - Folio:  "3a" → "3b" → "3c" → "3d" → "4a" (four columns per folio)
 * - everything else (Integer, Perek, Pasuk, Halakhah, Mishnah, Siman, Seif, Volume, …): 1 → 2
 *
 * @feature TXT-007 Talmud daf addressing (a/b, Hebrew dafs)
 * @feature TXT-013 Folio address type (a-d; the old client's parser rejected c/d)
 */

export type AddressType = string;

const SIDES: Record<string, string[]> = { Talmud: ["a", "b"], Folio: ["a", "b", "c", "d"] };

export function isLetteredAddressType(t: AddressType | undefined): boolean {
  return t !== undefined && t in SIDES;
}

/** Ordinal position of an address (1-based). Talmud "2a" → 3 (1a=1, 1b=2, 2a=3). */
export function addressToNumber(addr: string, type?: AddressType): number {
  const sides = type ? SIDES[type] : undefined;
  if (!sides) return Number.parseInt(addr, 10);
  const m = /^(\d+)([a-d])?$/.exec(addr);
  if (!m) return Number.NaN;
  const side = m[2] ? sides.indexOf(m[2]) : 0;
  return (Number(m[1]) - 1) * sides.length + side + 1;
}

/** Inverse of {@link addressToNumber}. */
export function numberToAddress(n: number, type?: AddressType): string {
  const sides = type ? SIDES[type] : undefined;
  if (!sides) return String(n);
  const i = n - 1;
  return `${Math.floor(i / sides.length) + 1}${sides[i % sides.length]}`;
}

export function nextAddress(addr: string, type?: AddressType, step = 1): string {
  return numberToAddress(addressToNumber(addr, type) + step, type);
}
