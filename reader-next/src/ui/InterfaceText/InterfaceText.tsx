import type { ReactNode } from "react";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { LangText } from "../LangText/LangText";

export interface InterfaceTextProps {
  en?: ReactNode;
  he?: ReactNode;
  /** Used when the interface language has no string and the other language has none either. */
  children?: ReactNode;
}

/**
 * A bilingual UI string. Shows the interface-language side and tags it with `lang` and `dir` (LangText) so the right
 * font, hyphenation and direction apply — a fallback side keeps its own direction inside the other (the old `.enInHe`). If only one side is supplied, that side is shown in either language
 * (a missing translation never produces an empty button).
 *
 * Replaces the old client's InterfaceText / EnglishText / HebrewText / SimpleInterfaceBlock family.
 */
export function InterfaceText({ en, he, children }: InterfaceTextProps) {
  const lang = useInterfaceLang();
  const preferred = lang === "hebrew" ? he : en;
  if (preferred !== undefined && preferred !== null && preferred !== "") {
    return <LangText lang={langCode(lang)}>{preferred}</LangText>;
  }
  const other = lang === "hebrew" ? en : he;
  if (other !== undefined && other !== null && other !== "") {
    return <LangText lang={lang === "hebrew" ? "en" : "he"}>{other}</LangText>;
  }
  return <>{children}</>;
}
