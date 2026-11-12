import type { ReactNode } from "react";
import type { LabelLang } from "~/lib/reader/labels";
import styles from "./SectionTitle.module.css";

export interface SectionTitleProps {
  en: string;
  he: string;
  /** The panel's label language (lib/reader/label-language): which of the two to show. */
  lang: LabelLang;
  /** Heading level. Section titles are level 2 inside a page whose book title is level 1. */
  level?: 2 | 3;
  children?: ReactNode;
}

/**
 * Title above a section ("1", "2a", or a full ref), in the panel's label language: the language on screen, or the interface
 * language in a bilingual panel. Replaces the old `.title > .titleBox`.
 *
 * @feature TXD-012 @feature TXD-011
 */
export function SectionTitle({ en, he, lang, level = 2 }: SectionTitleProps) {
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
  /** The panel's label language (lib/reader/label-language). */
  lang: LabelLang;
  /** An aliyah header (smaller, uppercase) rather than a parashah header. */
  aliyah?: boolean;
}

/** Parashah / aliyah header shown inside Torah text (and Onkelos). @feature TXT-002 @feature TXT-004 */
export function ParashahHeader({ en, he, lang, aliyah }: ParashahHeaderProps) {
  return (
    <h3 className={styles.parashah} data-aliyah={aliyah ? "true" : undefined} lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
      {lang === "he" ? he : en}
    </h3>
  );
}
