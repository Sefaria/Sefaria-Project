import type { ReactNode } from "react";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";

export interface InterfaceTextProps {
  en?: ReactNode;
  he?: ReactNode;
  /** Used when the interface language has no string and the other language has none either. */
  children?: ReactNode;
}

/**
 * A bilingual UI string. Shows the interface-language side and tags it with `lang` so the right
 * font and hyphenation apply. If only one side is supplied, that side is shown in either language
 * (a missing translation never produces an empty button).
 *
 * Replaces the old client's InterfaceText / EnglishText / HebrewText / SimpleInterfaceBlock family.
 */
export function InterfaceText({ en, he, children }: InterfaceTextProps) {
  const lang = useInterfaceLang();
  const preferred = lang === "hebrew" ? he : en;
  if (preferred !== undefined && preferred !== null && preferred !== "") {
    return <span lang={langCode(lang)}>{preferred}</span>;
  }
  const other = lang === "hebrew" ? en : he;
  if (other !== undefined && other !== null && other !== "") {
    return <span lang={lang === "hebrew" ? "en" : "he"}>{other}</span>;
  }
  return <>{children}</>;
}
