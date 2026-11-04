import type { ReactNode } from "react";
import { inlineMarkdownToHtml } from "~/lib/html/markdown";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LangText } from "../LangText/LangText";
import { Link } from "../Link/Link";
import styles from "./TopicsNav.module.css";

export interface MaybeBilingual {
  en?: string;
  he?: string;
}

/**
 * Bilingual markdown in the interface language (falling back to the other side, as the old InterfaceText), tagged with its own
 * language and direction.
 */
export function InterfaceMarkdown({ text, noLinks, className }: { text: MaybeBilingual | undefined; noLinks?: boolean; className?: string }) {
  const lang = useInterfaceLang();
  const want = langCode(lang);
  const other = want === "he" ? "en" : "he";
  const side = text?.[want] ? want : text?.[other] ? other : null;
  if (!side) return null;
  return <LangText lang={side} className={className} html={inlineMarkdownToHtml(text![side]!, noLinks)} />;
}

export interface TopicCardProps {
  href: string;
  title: { en: string; he: string };
  description?: MaybeBilingual;
  /** "Explore … ›" under the text (the landing page's cards). */
  bottomLink?: { href: string; en: string; he: string };
  /** The old Card's analytics: data-anl-event="<name>:click" on its links. */
  analyticsEvent?: string;
  /** A link the app routes (a category, A–Z) rather than a page that leaves it (a single topic, still Django's). */
  routed?: boolean;
  /** The landing page's fixed-height card with its blue top. */
  variant?: "toc" | "described";
  /** Descriptions without links (the Voices site). */
  noLinks?: boolean;
  /** Extra data-anl-* attributes on the title link. */
  titleAnl?: Record<string, string>;
}

/**
 * The old common/Card: a title link, a three-line description and an optional bottom link. Topic and category grids
 * (TopicTOCCard), the landing page's random cards and its calendar cards are all this card.
 *
 * @feature TOP-012 Topic card
 */
export function TopicCard({ href, title, description, bottomLink, analyticsEvent, routed, variant = "toc", noLinks, titleAnl }: TopicCardProps) {
  const A = routed ? Link : "a";
  const event = analyticsEvent ? `${analyticsEvent}:click` : undefined;
  return (
    <div className={variant === "described" ? `${styles.card} ${styles.described}` : styles.card}>
      <A className={styles.cardTitle} href={href} data-anl-text={title.en} data-anl-event={event} data-target-module="library" {...titleAnl}>
        <InterfaceText en={title.en} he={title.he} />
      </A>
      <div className={styles.cardDescription}>
        <InterfaceMarkdown text={description} noLinks={noLinks} />
      </div>
      {bottomLink ? (
        <div className={styles.bottomCardLink}>
          <a href={bottomLink.href} data-anl-text={bottomLink.en} data-anl-event={event} data-target-module="library">
            <InterfaceMarkdown text={{ en: bottomLink.en, he: bottomLink.he }} noLinks />
          </a>
        </div>
      ) : null}
    </div>
  );
}

/** The old .TOCCardsWrapper: cards two to a row with a hairline over the first row. */
export function TopicCardGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
