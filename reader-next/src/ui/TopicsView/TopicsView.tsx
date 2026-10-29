import type { ReactNode } from "react";
import { markdownToHtml } from "~/lib/html/markdown";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { topicSourceNote, type TopicItem } from "~/lib/connections/topics";
import { LoadingState } from "../Feedback/Feedback";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { SourceNote } from "../Tooltip/SourceNote";
import styles from "./TopicsView.module.css";
import { SITE_ORIGIN } from "~/lib/config";
import { LangText } from "../LangText/LangText";

export interface TopicsViewProps {
  topics: readonly TopicItem[];
  loading?: boolean;
  /** The selected passage in the interface language, for the "connected to …" note. */
  refLabel: string;
  /** Where a topic lives. */
  topicHref: (slug: string) => string;
  /** Language the descriptions are shown in. */
  lang: "en" | "he";
  /** Above the list: the moderators' topic search (TopicSearch), when the reader is one. */
  search?: ReactNode;
}

/**
 * Topics related to the selected passage: each a link with its description and, behind the three dots, who
 * connected it. "No known Topics Here." when there are none. The old TopicList.
 *
 * @feature CON-046 Topics for this ref
 */
export function TopicsView({ topics, loading, refLabel, topicHref, lang, search }: TopicsViewProps) {
  const interfaceLang = useInterfaceLang() === "hebrew" ? "he" : "en";
  if (loading) return <LoadingState />;
  if (!topics.length) {
    return (
      <>
        {search}
        <p className={styles.empty}>
          <InterfaceText en="No known Topics Here." he="אין קשרים ידועים." />
        </p>
      </>
    );
  }
  return (
    <>
    {search}
    <ul className={styles.list}>
      {topics.map((t) => {
        const note = topicSourceNote(t.sources, refLabel, interfaceLang);
        const desc = t.description?.[lang] || undefined;
        return (
          <li key={t.slug} className={styles.item}>
            <div className={styles.head}>
              <LangText as="a" href={topicHref(t.slug)} target="_blank" rel="noopener noreferrer" className={styles.title} lang={lang}>
                {t.title[lang]}
              </LangText>
              {note ? <SourceNote note={note} /> : null}
            </div>
            {desc ? <LangText as="div" className={styles.desc} lang={lang} html={markdownToHtml(desc, { baseUrl: SITE_ORIGIN })} /> : null}
          </li>
        );
      })}
    </ul>
    </>
  );
}
