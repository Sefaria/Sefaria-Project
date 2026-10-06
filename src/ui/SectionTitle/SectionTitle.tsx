import type { ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { ContentLanguage } from "~/lib/reader/settings";
import styles from "./SectionTitle.module.css";

export interface SectionTitleProps {
  en: string;
  he: string;
  language: ContentLanguage;
  /** Heading level. Section titles are level 2 inside a page whose book title is level 1. */
  level?: 2 | 3;
  children?: ReactNode;
}

/**
 * Title above a section ("1", "2a", or a full ref). In a bilingual panel it follows the interface
 * language. Replaces the old `.title > .titleBox`.
 *
 * @feature TXD-012 @feature TXD-011
 */
export function SectionTitle({ en, he, language, level = 2 }: SectionTitleProps) {
  const interfaceLang = useInterfaceLang();
  const lang = language === "bilingual" ? (interfaceLang === "hebrew" ? "he" : "en") : language === "hebrew" ? "he" : "en";
  const Heading = `h${level}` as "h2" | "h3";
  return (
    <div className={styles.title}>
      <Heading className={styles.box} lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
        {lang === "he" ? he : en}
      </Heading>
    </div>
  );
}

export interface ParashahHeaderProps {
  /** e.g. "Bereshit" or "Bereshit: First" */
  en: string;
  he: string;
  language: ContentLanguage;
  /** An aliyah header (smaller, uppercase) rather than a parashah header. */
  aliyah?: boolean;
}

/** Parashah / aliyah header shown inside Torah text (and Onkelos). @feature TXT-002 @feature TXT-004 */
export function ParashahHeader({ en, he, language, aliyah }: ParashahHeaderProps) {
  const interfaceLang = useInterfaceLang();
  const lang = language === "bilingual" ? (interfaceLang === "hebrew" ? "he" : "en") : language === "hebrew" ? "he" : "en";
  return (
    <h3 className={styles.parashah} data-aliyah={aliyah ? "true" : undefined} lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
      {lang === "he" ? he : en}
    </h3>
  );
}
