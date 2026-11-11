import type { MouseEvent, ReactNode } from "react";
import { ContentLangProvider } from "~/lib/i18n/content-lang";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon } from "../Icon/Icon";
import { IconButton } from "../IconButton/IconButton";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import styles from "./ConnectionsPanel.module.css";

export interface ConnectionsPanelProps {
  /** Heading of the current view ("Resources", or the filter name). Omit when there is a back link. */
  title?: ReactNode;
  /** Where the back link goes (usually the previous view) and what it says. */
  back?: { href: string; label: ReactNode; onClick?: (event: MouseEvent) => void };
  /** Closes the panel. */
  onClose?: () => void;
  /** Extra header actions. */
  actions?: ReactNode;
  /** The language the panel shows, and changing it: the aleph / ayin button before Close (CON-070). */
  lang?: "en" | "he";
  onLang?: (lang: "en" | "he") => void;
  /** Accessible name of the panel region: a view's English name (its Hebrew is looked up), or both names. */
  label: string | { en: string; he: string };
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
  // names in the interface's language (the Hebrew interface read "Resources", "Close", "… Language Toggle Icon")
  const he = useInterfaceLang() === "hebrew";
  const name = typeof label === "string" ? (he ? (VIEW_NAMES_HE[label] ?? label) : label) : he ? label.he || label.en : label.en;
  // the sidebar's language button says what it does (a11y N8; it was "Hebrew Language Toggle Icon")
  const toggleName = lang === "en" ? (he ? "הצגה בעברית" : "Show in Hebrew") : he ? "הצגה באנגלית" : "Show in English";
  return (
    <aside className={styles.panel} aria-label={name}>
      <div className={styles.header}>
        {back ? (
          <Link href={back.href} className={styles.back} onClick={back.onClick}>
            <Icon name="chevron-left" />
            <span>{back.label}</span>
          </Link>
        ) : (
          <h2 className={styles.headerTitle}>{title}</h2>
        )}
        {back ? <span style={{ flex: 1 }} /> : null}
        {actions}
        {onLang && lang ? (
          <button type="button" className={styles.langToggle} aria-label={toggleName} title={toggleName} onClick={() => onLang(lang === "en" ? "he" : "en")}>
            <img src={lang === "en" ? "/img/aleph.svg" : "/img/aye.svg"} alt="" width={18} height={18} />
          </button>
        ) : null}
        {onClose ? <IconButton icon="circle-close" label={he ? "סגירה" : "Close"} onClick={onClose} /> : null}
      </div>
      <div className={styles.body} data-panel-body>
        {/* the sidebar's content language is lang2: ContentText inside follows it, whatever the interface language */}
        {lang ? <ContentLangProvider lang={lang === "he" ? "hebrew" : "english"}>{children}</ContentLangProvider> : children}
      </div>
    </aside>
  );
}

/** The sidebar views' names in the Hebrew interface (the headings and back links of the same views). */
const VIEW_NAMES_HE: Record<string, string> = {
  Resources: "קישורים וכלים",
  "About This Text": "אודות ספר זה",
  "Table of Contents": "תוכן העניינים",
  "Search in this text": "חיפוש בטקסט",
  Translations: "תרגומים",
  Translation: "תרגום",
  Version: "מהדורה",
  "Web Pages": "דפי אינטרנט",
  Manuscripts: "כתבי יד",
  "Torah Readings": "קריאה בתורה",
  Topics: "נושאים",
  Dictionaries: "מילונים",
  Share: "שיתוף",
  Notes: "הערות",
  "Add to Sheet": "הוספה לדף מקורות",
  "Add Connection": "הוספת קישור",
  Feedback: "משוב",
  Advanced: "כלים מתקדמים",
};

/** "Resources" in both languages, the title of the top-level view. */
export const ResourcesTitle = () => <InterfaceText en="Resources" he="קישורים וכלים" />;
