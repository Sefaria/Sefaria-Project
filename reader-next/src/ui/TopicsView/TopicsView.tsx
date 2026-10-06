import { markdownToHtml } from "~/lib/html/markdown";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { topicSourceNote, type TopicItem } from "~/lib/connections/topics";
import { LoadingState } from "../Feedback/Feedback";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import styles from "./TopicsView.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export interface TopicsViewProps {
  topics: readonly TopicItem[];
  loading?: boolean;
  /** The selected passage in the interface language, for the "connected to …" note. */
  refLabel: string;
  /** Where a topic lives. */
  topicHref: (slug: string) => string;
  /** Language the descriptions are shown in. */
  lang: "en" | "he";
}

/**
 * Topics related to the selected passage: each a link with its description and, behind the three dots, who
 * connected it. "No known Topics Here." when there are none. The old TopicList.
 *
 * @feature CON-046 Topics for this ref
 */
export function TopicsView({ topics, loading, refLabel, topicHref, lang }: TopicsViewProps) {
  const interfaceLang = useInterfaceLang() === "hebrew" ? "he" : "en";
  if (loading) return <LoadingState />;
  if (!topics.length) {
    return (
      <p className={styles.empty}>
        <InterfaceText en="No known Topics Here." he="אין קשרים ידועים." />
      </p>
    );
  }
  return (
    <ul className={styles.list}>
      {topics.map((t) => {
        const note = topicSourceNote(t.sources, refLabel, interfaceLang);
        const desc = t.description?.[lang] || undefined;
        return (
          <li key={t.slug} className={styles.item}>
            <div className={styles.head}>
              <a href={topicHref(t.slug)} target="_blank" rel="noopener noreferrer" className={styles.title} lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
                {t.title[lang]}
              </a>
              {note ? <span className={styles.dots} role="img" aria-label={note} title={note}><Icon name="dots" size="1.1em" /></span> : null}
            </div>
            {desc ? <div className={styles.desc} lang={lang} dangerouslySetInnerHTML={{ __html: markdownToHtml(desc, { baseUrl: SITE_ORIGIN }) }} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
