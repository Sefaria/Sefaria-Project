/**
 * What a panel's header says. Ported from the old ReaderControls and VERIFIED on sefaria.org (2026-10-05, 16
 * texts × he/en/bi):
 *
 *  - The title is the section's name in the language of the version actually on screen (old useContentLang):
 *    Hebrew mode → the source's language; English mode → the translation's language (so a text whose "translation"
 *    is Hebrew, like the Zohar, has a Hebrew title); bilingual, or a language other than English/Hebrew (a French
 *    translation) → the interface language.
 *  - Talmud (Bavli) carries an attribution line — "The William Davidson Talmud" / "תלמוד מהדורת ויליאם דוידסון" —
 *    in every language mode.
 *  - The translation's name (its short title, else its full title) shows only when an English translation is on
 *    screen (English or bilingual), never in Hebrew-only mode; under an attribution it is wrapped in
 *    parentheses ("(Koren - Steinsaltz)").
 *
 * @feature TXD-013 Reader header title and version label
 * @feature VER-005 Version title subtitle in text header
 * @feature TXT-009 William Davidson Talmud attribution in header
 */
import type { InterfaceLang } from "~/lib/i18n/interface-lang";
import type { VersionMeta } from "~/lib/text/model";
import type { LabelLang } from "./labels";
import type { ContentLanguage } from "./settings";
import { encodeHebrewNumeral } from "~/lib/ref/hebrew-numerals";

export interface CategoryAttribution {
  categories: readonly string[];
  en: string;
  he: string;
  /** The page about the edition. */
  link: string;
}

/** Old Sefaria.categoryAttribution: one entry today. A book is covered when its categories start with these. */
const ATTRIBUTIONS: readonly CategoryAttribution[] = [
  { categories: ["Talmud", "Bavli"], en: "The William Davidson Talmud", he: "תלמוד מהדורת ויליאם דוידסון", link: "/william-davidson-talmud" },
];

export function categoryAttribution(categories: readonly string[] | undefined): CategoryAttribution | undefined {
  if (!categories) return undefined;
  return ATTRIBUTIONS.find((a) => categories.length >= a.categories.length && a.categories.every((c, i) => categories[i] === c));
}

export interface HeaderLabels {
  /** Language the title (and attribution) are written in. */
  lang: LabelLang;
  title: string;
  attribution?: { text: string; link: string };
  /** The translation's name, already parenthesised when an attribution is shown. */
  version?: string;
}

export interface HeaderInput {
  sectionRef: string;
  heSectionRef: string;
  categories?: readonly string[];
  translationVersion?: Pick<VersionMeta, "versionTitle" | "shortVersionTitle" | "languageFamilyName">;
  primaryVersion?: Pick<VersionMeta, "languageFamilyName">;
  language: ContentLanguage;
  interfaceLang: InterfaceLang;
}

/** Old useContentLang for content that defaults to the interface language when ambiguous. */
export function titleLanguage(i: Pick<HeaderInput, "language" | "interfaceLang" | "primaryVersion" | "translationVersion">): LabelLang {
  const iface: LabelLang = i.interfaceLang === "hebrew" ? "he" : "en";
  if (i.language === "bilingual") return iface;
  const shown = i.language === "english" && i.translationVersion ? i.translationVersion.languageFamilyName : i.primaryVersion?.languageFamilyName;
  if (shown === "english") return "en";
  if (shown === "hebrew") return "he";
  return shown ? iface : i.language === "hebrew" ? "he" : "en"; // another language: the interface's; nothing loaded yet: the mode's
}

export function headerLabels(i: HeaderInput): HeaderLabels {
  const lang = titleLanguage(i);
  const attr = categoryAttribution(i.categories);
  const shortName = i.translationVersion && (i.translationVersion.shortVersionTitle || i.translationVersion.versionTitle);
  const showsVersion = i.language === "english" || i.language === "bilingual";
  return {
    lang,
    title: lang === "he" ? i.heSectionRef : i.sectionRef,
    ...(attr ? { attribution: { text: attr[lang], link: attr.link } } : {}),
    ...(showsVersion && shortName ? { version: attr ? `(${shortName})` : shortName } : {}),
  };
}

/**
 * The section's name narrowed to the verses of a kept range that it shows, as the old header does for a Torah portion or aliyah
 * ("Genesis 6:9-22" / "בראשית ו׳:ט׳-כ״ב" while chapter 6 of Genesis 6:9-11:32 is on screen). `verses` are the section's
 * highlighted verse numbers, in order.
 */
export function narrowToVerses<T extends Pick<HeaderInput, "sectionRef" | "heSectionRef">>(i: T, verses: readonly number[]): T {
  const first = verses[0], last = verses[verses.length - 1];
  if (first === undefined || last === undefined) return i;
  const span = (f: (n: number) => string) => (first === last ? f(first) : `${f(first)}-${f(last)}`);
  return { ...i, sectionRef: `${i.sectionRef}:${span(String)}`, heSectionRef: `${i.heSectionRef}:${span((n) => encodeHebrewNumeral(n))}` };
}

export interface TitleVersesInput {
  /** The segment the address named, while the reader has not moved since arriving on it (and it is in the section titled). */
  entrySegment?: number;
  /** The kept range's verses in the section titled, in order (a Torah portion, an aliyah, "Genesis 1:3-5"). */
  rangeVerses: readonly number[];
  /** The section titled is a daf (its segments are lines). */
  talmud: boolean;
  /** The kept range lies inside the section titled. */
  rangeWithinSection: boolean;
  /** The panel's language mode. */
  language: ContentLanguage;
}

/**
 * Which verses the title names, as sefaria.org's header names the panel's current ref (`currentlyVisibleRef`, ReaderPanel.jsx
 * render). Its current ref starts as the address and becomes the section in view on the first scroll it hears
 * (TextColumn.adjustHighlightedAndVisible); choosing a verse (which opens the sidebar) does not change it. Measured on
 * www.sefaria.org (2026-11-12, reports of the language parity run):
 *
 *  - Hebrew or English mode: on arrival at a segment address the title names that segment ("Genesis 1:3", "Rashi on Genesis
 *    1:1:1", "Berakhot 2a:3"), until the reader scrolls. In bilingual mode the old reader re-measures once both sides are laid
 *    out, and that scroll already turns the title into the section ("Genesis 1"), with or without the sidebar.
 *  - A kept range names its verses in this section ("Genesis 6:9-22" for a Torah portion). A range of lines inside one daf names
 *    the daf ("Berakhot 2a" for Berakhot 2a:3-5), except in Hebrew mode, where it stays the range ("ברכות ב׳ א:ג׳-ה׳").
 */
export function titleVerses(i: TitleVersesInput): readonly number[] {
  if (i.entrySegment !== undefined) return i.language === "bilingual" ? [] : [i.entrySegment];
  if (i.talmud && i.rangeWithinSection && i.language !== "hebrew") return [];
  return i.rangeVerses;
}
