/**
 * The language of the labels a text panel prints around the text: the book title at the top of the column, section and
 * parashah headers, and segment numbers (Hebrew letters or digits). Port of the old client's
 * `useContentLang(defaultToInterfaceOnBilingual = true)`, decided once per section rather than per label:
 *
 *  - Bilingual mode → the interface language, even when the section shows only one language.
 *  - Hebrew mode → the language of the source on screen ("hebrew" for most books; "english" for an English-original work,
 *    whose source is English).
 *  - English mode → the language of the translation when the section has one (Hebrew for the Zohar, whose translation is the
 *    "Hebrew Translation"), else the source's language.
 *  - A shown language that is neither Hebrew nor English (a French translation, an Aramaic source) → the interface language.
 *  - Nothing loaded yet → the mode's own language.
 *
 * The panel title uses the same rule (`titleLanguage` in ./header); this module builds on it so the two cannot drift.
 *
 * @feature TXD-012 @feature TXD-045 @feature TXT-002
 */
import type { InterfaceLang } from "~/lib/i18n/interface-lang";
import type { TextPassage } from "~/lib/text/model";
import { titleLanguage, type HeaderInput } from "./header";
import type { LabelLang } from "./labels";
import type { ContentLanguage } from "./settings";

export interface LabelLanguageInput {
  language: ContentLanguage;
  interfaceLang: InterfaceLang;
  primaryVersion?: HeaderInput["primaryVersion"];
  translationVersion?: HeaderInput["translationVersion"];
  /** Whether the section has any translation text (the old `textsData.text.length`). */
  hasTranslation: boolean;
}

export function labelLanguage(i: LabelLanguageInput): LabelLang {
  // A section with no translation text is labelled from its source; a section with no source, from the translation it shows.
  const translationVersion = i.hasTranslation ? i.translationVersion : undefined;
  const primaryVersion = i.primaryVersion ?? (i.language === "hebrew" ? translationVersion : undefined);
  return titleLanguage({ language: i.language, interfaceLang: i.interfaceLang, primaryVersion, translationVersion });
}

/** `labelLanguage` for a loaded section. */
export function passageLabelLanguage(
  passage: Pick<TextPassage, "primaryVersion" | "translationVersion" | "segments">,
  language: ContentLanguage,
  interfaceLang: InterfaceLang,
): LabelLang {
  return labelLanguage({
    language,
    interfaceLang,
    primaryVersion: passage.primaryVersion,
    translationVersion: passage.translationVersion,
    hasTranslation: !!passage.translationVersion && passage.segments.some((s) => s.translation !== undefined && s.translation !== ""),
  });
}
