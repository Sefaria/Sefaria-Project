import type { ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import { IconButton } from "../IconButton/IconButton";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import styles from "./ConnectionsPanel.module.css";

export interface ConnectionsPanelProps {
  /** Heading of the current view ("Resources", or the filter name). Omit when there is a back link. */
  title?: ReactNode;
  /** Where the back link goes (usually the previous view) and what it says. */
  back?: { href: string; label: ReactNode };
  /** Closes the panel. */
  onClose?: () => void;
  /** Extra header actions. */
  actions?: ReactNode;
  /** The language the panel shows, and changing it: the aleph / ayin button before Close (CON-070). */
  lang?: "en" | "he";
  onLang?: (lang: "en" | "he") => void;
  /** Accessible name of the panel region. */
  label: string;
  children: ReactNode;
}

/**
 * The resources sidebar: a header (title or back link, actions, close) over a scrolling body. Replaces
 * ConnectionsPanelHeader and the `.connectionsPanel` wrapper. The body scrolls; the header stays.
 *
 * @feature CON-003 Connections panel header (back/title/close)
 * @feature CON-070 Sidebar header title, back and close
 */
export function ConnectionsPanel({ title, back, onClose, actions, lang, onLang, label, children }: ConnectionsPanelProps) {
  return (
    <aside className={styles.panel} aria-label={label}>
      <div className={styles.header}>
        {back ? (
          <Link href={back.href} className={styles.back}>
            <Icon name="chevron-left" />
            <span>{back.label}</span>
          </Link>
        ) : (
          <h2 className={styles.headerTitle}>{title}</h2>
        )}
        {back ? <span style={{ flex: 1 }} /> : null}
        {actions}
        {onLang && lang ? (
          <button type="button" className={styles.langToggle} aria-label={lang === "en" ? "Hebrew Language Toggle Icon" : "English Language Toggle Icon"} onClick={() => onLang(lang === "en" ? "he" : "en")}>
            <img src={lang === "en" ? "/img/aleph.svg" : "/img/aye.svg"} alt="" width={18} height={18} />
          </button>
        ) : null}
        {onClose ? <IconButton icon="circle-close" label="Close" onClick={onClose} /> : null}
      </div>
      <div className={styles.body} data-panel-body>
        {children}
      </div>
    </aside>
  );
}

/** "Resources" in both languages, the title of the top-level view. */
export const ResourcesTitle = () => <InterfaceText en="Resources" he="קישורים וכלים" />;
