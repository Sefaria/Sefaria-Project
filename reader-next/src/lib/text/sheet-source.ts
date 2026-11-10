/**
 * What Add to Sheet posts for the verses the reader chose, beyond refs and versions (old AddToSourceSheetBox):
 *  - words selected in the text (one language shown): the source's text is cut to the selection, with "..." where it was cut
 *    (handleSelectedWords, longestSuffixPrefixIndex / longestPrefixSuffixIndex), formatted as the old sheetsUtils.segmentsToSourceText;
 *  - a verse that is only an image is not added: sheets do not take images (checkContentForImages).
 *
 * One deliberate difference: the old code trimmed only the start of a single verse (its end branch is an `else if` after the first
 * segment's), and found the start only when the selection ran to the verse's end, so words chosen inside one verse added the whole
 * verse. Here the selection is found inside the verse and both ends are cut.
 *
 * @feature CON-056 Add to sheet: version and partial-selection handling
 * @feature CON-034 Add connection to sheet button
 */
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";
import type { TextPassage } from "./model";
import { isFullSegmentImage, prepareSegmentHtml } from "./prepare";

export const IMAGE_NOT_SUPPORTED = { en: "We do not currently support adding images to source sheets.", he: "לא ניתן כרגע להוסיף תמונות לדפי מקורות." };

/** The words of a segment as the reader sees them: no tags, footnotes or itags; whitespace collapsed (old normalize). */
export function segmentPlainText(html: string): string {
  const prepared = prepareSegmentHtml(html).html;
  const noMarkers = prepared.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "").replace(/<br\s*\/?>/gi, " ");
  const text = noMarkers.replace(/<[^>]*>/g, "");
  return decodeEntities(text).replace(/[\s  ]+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    if (k === "nbsp") return " ";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

/** Index in `a` where its longest suffix that starts `b` begins (0 when none). Old longestSuffixPrefixIndex. */
export function longestSuffixPrefixIndex(a: string, b: string): number {
  let index = 0;
  for (let i = 0; i < a.length; i++) if (b.startsWith(a.slice(i))) index = i;
  return index;
}

/** Index in `a` where its longest prefix that ends `b` ends (0 when none). Old longestPrefixSuffixIndex. */
export function longestPrefixSuffixIndex(a: string, b: string): number {
  let index = 0;
  for (let i = 0; i < a.length; i++) if (b.endsWith(a.slice(0, i + 1))) index = i + 1;
  return index;
}

/** Each segment's text cut to the selected words (plain texts in, plain texts out; "..." where cut). */
export function trimToSelection(texts: readonly string[], selected: string): string[] {
  const words = selected.replace(/[\s  ]+/g, " ").trim();
  if (!words || !texts.length) return [...texts];
  if (texts.length === 1) {
    const t = texts[0]!;
    const at = t.indexOf(words);
    if (at < 0) return [t];
    return [(at > 0 ? "..." : "") + words + (at + words.length < t.length ? "..." : "")];
  }
  return texts.map((t, i) => {
    if (i === 0) {
      const at = longestSuffixPrefixIndex(t, words);
      return (at === 0 ? "" : "...") + t.slice(at);
    }
    if (i === texts.length - 1) {
      const end = longestPrefixSuffixIndex(t, words);
      return end === 0 || end >= t.length ? t : t.slice(0, end) + "...";
    }
    return t;
  });
}

export interface SheetSegment {
  /** The segment's address shown in the gutter ("3", "2a:5" → its last part). */
  number: string;
  text: string;
}

/**
 * The source's text for one side (old segmentsToSourceText): each segment `<span class='segment'><small>(n)</small> text </span> `,
 * numbered except in Talmud and the Haggadah, and in its own paragraph except in Tanakh and Talmud.
 */
export function sourceText(segments: readonly SheetSegment[], opts: { categories: readonly string[]; book: string; side: "he" | "en" }): string {
  const talmud = opts.categories.includes("Talmud");
  const numbered = !talmud && opts.book !== "Pesach Haggadah";
  const paragraphs = !(opts.categories[0] === "Tanakh" || opts.categories[0] === "Talmud");
  return segments
    .filter((s) => s.text)
    .map((s) => {
      const n = /^\d+$/.test(s.number) && opts.side === "he" ? encodeHebrewNumeral(Number(s.number)) : s.number;
      const span = `<span class='segment'>${numbered ? `<small>(${n})</small> ` : ""}${escapeText(s.text)} </span> `;
      return paragraphs ? `<p>${span}</p>` : span;
    })
    .join("");
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** True when any of these segments (either side) is only an image. */
export const anyFullImage = (htmls: readonly (string | undefined)[]): boolean => htmls.some((h) => isFullSegmentImage(h));

export interface SheetExtras {
  /** A verse is only an image: sheets do not take images (old checkContentForImages). */
  hasImage: boolean;
  /** The source's text for the side shown, cut to the words selected in it (old handleSelectedWords; one language shown only). */
  text?: { side: "he" | "en"; html: string };
}

/** What the old AddToSourceSheetBox added to refs and versions for these verses: the image guard and the selected words. */
export function sheetExtras(section: TextPassage | undefined, refs: readonly string[], language: "bilingual" | "english" | "hebrew", selection: { words: string; refs: string[] } | null): SheetExtras {
  const segs = refs.map((r) => section?.segments.find((s) => s.ref === r));
  const hasImage = anyFullImage(segs.flatMap((s) => [s?.primary, s?.translation]));
  if (!section || language === "bilingual" || !selection || segs.some((s) => !s) || selection.refs.join("|") !== refs.join("|")) return { hasImage };
  const side = language === "hebrew" ? "primary" : "translation";
  const version = side === "primary" ? section.primaryVersion : section.translationVersion;
  const texts = trimToSelection(segs.map((s) => segmentPlainText(s![side] ?? "")), selection.words);
  const key = version?.direction === "ltr" ? "en" : version?.direction === "rtl" ? "he" : side === "primary" ? "he" : "en";
  const html = sourceText(
    segs.map((s, i) => ({ number: s!.address.at(-1) ?? "", text: texts[i]! })),
    { categories: section.categories, book: section.indexTitle, side: key },
  );
  return { hasImage, text: { side: key, html } };
}

