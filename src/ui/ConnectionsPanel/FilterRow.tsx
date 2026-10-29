import type { MouseEvent, ReactNode } from "react";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon, type IconName } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";
import styles from "./FilterRow.module.css";
import { LangText } from "../LangText/LangText";

export interface FilterRowProps {
  label: { en: string; he: string };
  /** Number of links. Omit for rows with no count (essays, tools). */
  count?: number;
  /** CSS colour for the icon (a category colour). */
  color?: string;
  icon?: IconName;
  /** Marks rows whose sources include an English translation. */
  hasEnglish?: boolean;
  description?: { en?: string; he?: string };
  /** The view this row opens. Always a real link, so ctrl-click opens it in a new tab. */
  href: string;
  /** Handle a plain click as client navigation; modified clicks fall through to the browser. */
  onNavigate?: (href: string, event: MouseEvent) => void;
  /** Called on any click (analytics: the old handlers reported plain and modified clicks alike). */
  onTrack?: () => void;
  /** Greyed out: no links for this selection (the row still lists the commentator). */
  dimmed?: boolean;
  /** The active filter. */
  current?: boolean;
  /** Opens another site/module in a new tab (a plain anchor, not an in-app link). */
  external?: boolean;
  /** A trailing node (e.g. an external-link icon). */
  trailing?: ReactNode;
  /** A tool or resource row (About, Sheets, Share…): sans-serif with letter-spacing, unlike the serif category rows. */
  tool?: boolean;
  /**
   * The sidebar's content language (`lang2`). When set, the label and description show in that language only, with
   * no fallback to the other (the old ContentText), and the EN tag is hidden in Hebrew. Otherwise the interface's.
   */
  contentLang?: "en" | "he";
  /** "list": a row of a category's book list (ConnectionsList): no icon, a rule beneath, a description under every row. */
  variant?: "list";
  /** The list's lead row ("All Commentary"): black, where the books are #333. */
  lead?: boolean;
}

/**
 * One selectable row in the sidebar: a category ("Commentary (958)"), a book ("Rashi (3)"), an essay or a
 * tool. A real link. Replaces CategoryFilter, TextFilter, ToolsButton and the summary rows.
 *
 * @feature CON-019 @feature CON-025 @feature CON-026 @feature CON-016
 */
export function FilterRow({ label, count, color, icon = "book", hasEnglish, description, href, onNavigate, dimmed, current, trailing, external, tool, onTrack, contentLang, variant, lead }: FilterRowProps) {
  const interfaceLang = useInterfaceLang();
  const lang = contentLang ? (contentLang === "he" ? "hebrew" : "english") : interfaceLang;
  const Anchor = external ? PlainAnchor : Link;
  const desc = description && (contentLang ? description[contentLang] : lang === "hebrew" ? description.he || description.en : description.en || description.he);
  const list = variant === "list";
  const showTag = hasEnglish && contentLang !== "he";
  const tag = showTag ? (
    <>
      <span className={styles.tag} aria-hidden="true" title="English available">EN</span>
      <VisuallyHidden><InterfaceText en="English available" he="זמין באנגלית" /></VisuallyHidden>
    </>
  ) : null;
  return (
    <Anchor
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={[styles.row, list && styles.list, lead && styles.lead, dimmed && styles.dimmed, current && styles.current].filter(Boolean).join(" ")}
      style={{ ["--_color" as string]: color }}
      aria-current={current ? "true" : undefined}
      data-tool={tool || undefined}
      dir={contentLang ? (contentLang === "he" ? "rtl" : "ltr") : undefined}
      onClick={(e) => {
        onTrack?.();
        if (onNavigate && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          onNavigate(href, e);
        }
      }}
    >
      {list ? null : <span className={styles.icon}><Icon name={icon} size={tool ? "18px" : "1.3em"} /></span>}
      <span className={styles.main}>
        {/* in a list the EN tag sits at the end of the title line, so the description below takes the full width */}
        <span className={list ? styles.titleLine : undefined}>
          <span>
            <LangText className={styles.label} lang={lang === "hebrew" ? "he" : "en"}>
              {contentLang ? label[contentLang] : <InterfaceText en={label.en} he={label.he} />}
            </LangText>
            {count !== undefined ? <span className={styles.count}>({count})</span> : null}
          </span>
          {list ? tag : null}
        </span>
        {desc ? <LangText className={styles.description} lang={contentLang ?? (lang === "hebrew" ? "he" : "en")}>{desc}</LangText> : null}
      </span>
      {list ? null : tag}
      {trailing}
    </Anchor>
  );
}

/**
 * A heading with a rule beneath. "label" is the small uppercase one of the Resources home ("Related Texts");
 * "title" is the larger mixed-case one of the About box and sidebar modules ("About This Text", "Related Topics").
 */
export function PanelSectionHeading({ children, variant = "label" }: { children: ReactNode; variant?: "label" | "title" | "language" }) {
  return <h3 className={variant === "title" ? styles.headingTitle : variant === "language" ? styles.headingLanguage : styles.heading}>{children}</h3>;
}

const PlainAnchor = (props: React.ComponentProps<"a"> & { href: string }) => <a {...props} />;
