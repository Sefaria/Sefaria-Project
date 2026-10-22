/**
 * Ref ⇄ URL conversion, compatible with Sefaria's canonical URL form (`Ref.url()` in
 * Sefaria-Project sefaria/model/text.py): spaces → `_`, `:` → `.`, the space before the
 * section string → `.`, and `?` → `%3F`.
 *
 *   "Genesis 1:1"              ⇄ "Genesis.1.1"
 *   "Mishnah Berakhot 2:3"     ⇄ "Mishnah_Berakhot.2.3"
 *   "Berakhot 2a:3-5"          ⇄ "Berakhot.2a.3-5"
 *   "Pesach Haggadah, Kadesh"  ⇄ "Pesach_Haggadah,_Kadesh"
 *
 * Parsing is purely syntactic (no title database): the trailing run of numeric/daf
 * sections is the section string, everything before it is the title. Canonicalisation
 * (alternate titles, Hebrew titles, abbreviations) is done by the API and cached.
 *
 * @feature RTE-027 Ref URL normalization to canonical form; TXD-014 client ref parsing
 */

/** One address component: an integer, or a daf like "2a"/"2b", or a folio side like "3c". */
const ADDRESS = String.raw`\d+[a-d]?`;
const SECTIONS = String.raw`${ADDRESS}(?:[.:]${ADDRESS})*`;
const RANGE = String.raw`(?:-${SECTIONS})?`;

const URL_SECTIONS_RE = new RegExp(String.raw`^(.*?)\.(${SECTIONS}${RANGE})$`);
const HUMAN_SECTIONS_RE = new RegExp(String.raw`^(.*?) (${ADDRESS}(?::${ADDRESS})*(?:-${ADDRESS}(?::${ADDRESS})*)?)$`);

export interface ParsedRef {
  /** Title part, possibly with complex-text node names ("Pesach Haggadah, Kadesh"). */
  title: string;
  /** Start address, e.g. ["2a", "3"]. Empty for a whole book or node. */
  sections: string[];
  /** End address, with the same length as `sections` (ranges fill from the left). */
  toSections: string[];
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Splits "1:2-3:4" (or "1.2-3.4") into start/end arrays of equal length. */
export function parseSectionString(s: string): { sections: string[]; toSections: string[] } {
  const [start = "", end] = s.split("-");
  const sections = start.split(/[.:]/).filter(Boolean);
  if (!end) return { sections, toSections: [...sections] };
  const endParts = end.split(/[.:]/).filter(Boolean);
  const toSections = [...sections.slice(0, sections.length - endParts.length), ...endParts];
  return { sections, toSections };
}

/** Parse a URL path segment ("Genesis.1.1-5") into its title and sections. */
export function parseUrlRef(urlRef: string): ParsedRef {
  const s = decode(urlRef).replace(/^\/+|\/+$/g, "");
  const m = URL_SECTIONS_RE.exec(s);
  const title = (m ? m[1]! : s).replace(/_/g, " ").trim();
  const { sections, toSections } = m ? parseSectionString(m[2]!) : { sections: [], toSections: [] };
  return { title, sections, toSections };
}

/** Parse a human ref ("Genesis 1:1-5") into its title and sections. */
export function parseHumanRef(ref: string): ParsedRef {
  const s = ref.trim();
  const m = HUMAN_SECTIONS_RE.exec(s);
  if (!m) return { title: s, sections: [], toSections: [] };
  return { title: m[1]!, ...parseSectionString(m[2]!) };
}

/** Format sections back into a human section string ("1:1-5", "2a:3-3b:2"). */
export function formatSections(sections: string[], toSections: string[], sep = ":"): string {
  const start = sections.join(sep);
  let i = 0;
  while (i < sections.length && sections[i] === toSections[i]) i++;
  if (i === sections.length) return start;
  return `${start}-${toSections.slice(i).join(sep)}`;
}

export function toHumanRef(p: ParsedRef): string {
  return p.sections.length ? `${p.title} ${formatSections(p.sections, p.toSections)}` : p.title;
}

/** "Genesis.1.1" → "Genesis 1:1". */
export function urlToRef(urlRef: string): string {
  return toHumanRef(parseUrlRef(urlRef));
}

function encodeTitle(title: string): string {
  return title.replace(/ /g, "_").replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%(?![0-9A-F]{2})/gi, "%25");
}

/** "Genesis 1:1" → "Genesis.1.1"; "Pesach Haggadah, Kadesh" → "Pesach_Haggadah,_Kadesh". */
export function refToUrl(ref: string): string {
  const p = parseHumanRef(ref);
  const title = encodeTitle(p.title);
  return p.sections.length ? `${title}.${formatSections(p.sections, p.toSections, ".")}` : title;
}

/** True when the ref addresses a range of more than one segment/section. */
export function isRangedRef(ref: string): boolean {
  const p = parseHumanRef(ref);
  return p.sections.some((s, i) => s !== p.toSections[i]);
}
