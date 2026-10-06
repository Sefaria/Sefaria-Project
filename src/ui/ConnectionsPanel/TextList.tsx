import type { MouseEvent, ReactNode } from "react";
import type { VocalizationMode } from "@vendor/sefaria-toolkit/text-transform/index";
import { visibleSides } from "~/lib/reader/labels";
import { Icon } from "../Icon/Icon";
import { LoadingState } from "../Feedback/Feedback";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { SegmentText, type SegmentTextProps } from "../SegmentText/SegmentText";
import styles from "./TextList.module.css";

export interface LinkedTextSide {
  html: string;
  lang: string;
  dir: "rtl" | "ltr";
}

export interface LinkedTextItem {
  id: string;
  sourceRef: string;
  sourceHeRef: string;
  /** Link to open this text in the reader. */
  href: string;
  primary?: LinkedTextSide;
  translation?: LinkedTextSide;
  /** Verse number the link attaches to (shown for commentary when several verses are listed). */
  number?: string;
  /** True while this item's text is still loading. */
  loading?: boolean;
}

export interface TextListProps {
  /** Heading: the filter ("Rashi"). */
  title: { en: string; he: string };
  /** Underline colour (the category's). */
  color?: string;
  items: LinkedTextItem[];
  /** One language at a time in the sidebar. */
  language: "hebrew" | "english";
  vocalization?: VocalizationMode;
  /** Commentary items hide their title line, since the text begins with the lemma; set for the plain "Commentary" list. */
  hideItemTitles: boolean;
  loading?: boolean;
  /** Message when there are no items. */
  emptyMessage?: ReactNode;
  onRefClick?: SegmentTextProps["onRefClick"];
  onOpen?: (href: string, event: MouseEvent) => void;
}

/**
 * The connected texts for a filter: each link's text with a title, an "Open" link, and (for commentary)
 * its anchor verse. Shows one language at a time. Replaces TextList and the sidebar's TextRange items.
 *
 * @feature CON-030 Connected texts list
 * @feature CON-032 Connection item rendering
 * @feature CON-033 Open connected text in main panel
 */
export function TextList({ title, color, items, language, vocalization, hideItemTitles, loading, emptyMessage, onRefClick, onOpen }: TextListProps) {
  return (
    <div>
      <h3 className={styles.title} style={{ ["--_color" as string]: color }}>
        <InterfaceText en={title.en} he={title.he} />
        <span className={styles.titleBar} aria-hidden="true" />
      </h3>
      {loading ? <LoadingState /> : null}
      {!loading && items.length === 0 ? (
        <p className={styles.notice}>{emptyMessage ?? <InterfaceText en="No connections known." he="אין קישורים ידועים." />}</p>
      ) : null}
      <ul className={styles.list}>
        {items.map((item) => {
          const sides = visibleSides(language, { primary: Boolean(item.primary?.html.trim()), translation: Boolean(item.translation?.html.trim()) });
          const side = sides.primary ? item.primary : sides.translation ? item.translation : (item.primary ?? item.translation);
          return (
            <li key={item.id} className={styles.item} data-ref={item.sourceRef} data-lang={side?.dir === "rtl" ? "he" : "en"}>
              {hideItemTitles ? null : (
                <div className={styles.ref}>
                  <Link href={item.href}><InterfaceText en={item.sourceRef} he={item.sourceHeRef} /></Link>
                </div>
              )}
              <p className={styles.text}>
                {item.number ? <span className={styles.number} aria-hidden="true">{item.number}</span> : null}
                {side ? (
                  <SegmentText html={side.html} lang={side.lang} dir={side.dir} vocalization={vocalization} onRefClick={onRefClick} />
                ) : item.loading ? (
                  <span aria-busy="true"><InterfaceText en="Loading…" he="טוען…" /></span>
                ) : null}
              </p>
              <div className={styles.actions}>
                <Link
                  className={styles.open}
                  href={item.href}
                  onClick={(e: MouseEvent) => {
                    if (onOpen && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      onOpen(item.href, e);
                    }
                  }}
                >
                  <Icon name="external-link" size="16px" />
                  <InterfaceText en="Open" he="פתח" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
