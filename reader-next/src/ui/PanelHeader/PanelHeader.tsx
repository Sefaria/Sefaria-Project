import type { ReactNode } from "react";
import { CategoryColorLine } from "../CategoryColorLine/CategoryColorLine";
import styles from "./PanelHeader.module.css";

export interface PanelHeaderProps {
  title: ReactNode;
  /** Lines under the title (an attribution, a version name). Each child element is its own line. */
  subtitle?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  /** Leading control: close, back or menu. */
  start?: ReactNode;
  /** Trailing actions: save, display settings. */
  end?: ReactNode;
  /** Category (or its path) for the coloured line above the bar. */
  category?: string | readonly string[];
  sticky?: boolean;
}

/**
 * The 60px toolbar at the top of a panel. The title is a real heading (the old reader made it a link with
 * `role=heading aria-live`); actions are separate buttons.
 * Replaces ReaderControls, ConnectionsPanelHeader, ComparePanelHeader and the sheet meta header.
 *
 * @feature SHL-074 Panel header @feature TXD-013 Header shows ref and version attribution
 */
export function PanelHeader({ title, subtitle, headingLevel = 1, start, end, category, sticky }: PanelHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";
  return (
    <header className={`${styles.header} ${sticky ? styles.sticky : ""}`}>
      {category ? <CategoryColorLine category={category} /> : null}
      <div className={styles.bar}>
        <div className={styles.start}>{start}</div>
        <div className={styles.center}>
          <Heading className={styles.title}>{title}</Heading>
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        <div className={styles.end}>{end}</div>
      </div>
    </header>
  );
}
