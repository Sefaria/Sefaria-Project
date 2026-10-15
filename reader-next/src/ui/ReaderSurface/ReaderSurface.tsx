import type { CSSProperties, ReactNode } from "react";
import { fontScale, type BiLayout, type ContentLanguage, type Layout } from "~/lib/reader/settings";
import styles from "./ReaderSurface.module.css";

export interface ReaderSurfaceProps {
  language: ContentLanguage;
  layout: Layout;
  biLayout: BiLayout;
  /** Old-client font-size percentage (62.5 = default). */
  fontSize: number;
  children: ReactNode;
}

/** Applies the reader's display settings to everything inside it. */
export function ReaderSurface({ language, layout, biLayout, fontSize, children }: ReaderSurfaceProps) {
  return (
    <div
      className={styles.surface}
      data-language={language}
      data-layout={layout}
      data-bilayout={language === "bilingual" ? biLayout : undefined}
      style={{ ["--sefaria-reader-font-scale" as string]: fontScale(fontSize) } as CSSProperties}
    >
      {children}
    </div>
  );
}
