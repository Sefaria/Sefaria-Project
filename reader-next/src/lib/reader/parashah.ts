/**
 * Parasha / aliyah headers inside Torah text.
 * Port of Sefaria.util.parashahHeader (static/js/sefaria/util.js:23-42), made safe for alt structures
 * that have no aliyah keys (Psalms days, Talmud chapters).
 *
 * @feature TXT-002 Parashah and aliyah headers in Torah text
 * @feature TXT-003 TXT-004 Aliyot toggle; Onkelos headers
 */
import type { Segment, TextPassage } from "~/lib/text/model";

export interface ParashahHeaderData {
  en: string;
  he: string;
  /** True for a plain parasha title; false for "{parasha}: {aliyah}" (styled as an aliyah header). */
  parashaTitle: boolean;
}

/** Headers apply to the Torah (non-commentary) and to Onkelos. Everything else ignores `alts`. */
export function showsParashahHeaders(p: Pick<TextPassage, "categories" | "isDependant">): boolean {
  return (p.categories[1] === "Torah" && !p.isDependant) || p.categories[2] === "Onkelos";
}

export function parashahHeader(p: Pick<TextPassage, "categories" | "isDependant">, segment: Pick<Segment, "alt">, includeAliyot: boolean): ParashahHeaderData | null {
  if (!showsParashahHeaders(p)) return null;
  const alt = segment.alt;
  if (!alt) return null;
  if (includeAliyot && alt.aliyah_en) {
    return {
      en: `${alt.parasha_en ?? ""}: ${alt.aliyah_en}`,
      he: `${alt.parasha_he ?? ""}: ${alt.aliyah_he ?? ""}`,
      parashaTitle: false,
    };
  }
  if (alt.whole && alt.en?.[0]) {
    return { en: alt.en[0], he: alt.he?.[0] ?? alt.en[0], parashaTitle: true };
  }
  return null;
}

/**
 * Whether a segment starts a Torah portion or one of its aliyot. A range URL that starts here is a portion or an aliyah (the
 * book TOC's links, /Parashat_X): sefaria.org keeps such a range in the URL and highlights it, where a short arbitrary range
 * (Genesis 1:3-5) collapses to its first verse (VERIFIED 2026-10-28, scratchpad probes).
 */
export function startsParashahOrAliyah(p: Pick<TextPassage, "categories" | "isDependant">, segment: Pick<Segment, "alt"> | undefined): boolean {
  if (!segment?.alt || !showsParashahHeaders(p)) return false;
  return !!segment.alt.aliyah_en || !!segment.alt.whole;
}
