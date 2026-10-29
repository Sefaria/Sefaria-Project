import { useState } from "react";
import type { RelatedTopic } from "~/lib/catalog/index-details";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { PanelSectionHeading } from "../ConnectionsPanel/FilterRow";
import styles from "./RelatedTopics.module.css";

export interface RelatedTopicsProps {
  topics: readonly RelatedTopic[];
  /** Where a topic lives (a real link). */
  topicHref: (slug: string) => string;
  /** How many show before "More". */
  initial?: number;
}

/**
 * Topics related to a book: the first five, then "More". Hidden when there are none. The old sidebar module of
 * the same name, used by the About box, the book page and category pages.
 *
 * @feature BOK-022 Related topics of a book
 * @feature LIB-046 Sidebar module: Related topics
 */
export function RelatedTopics({ topics, topicHref, initial = 5 }: RelatedTopicsProps) {
  const [all, setAll] = useState(false);
  if (!topics.length) return null;
  const shown = all ? topics : topics.slice(0, initial);
  return (
    <section aria-label="Related Topics" className={styles.module}>
      <PanelSectionHeading variant="title">
        <InterfaceText en="Related Topics" he="נושאים קשורים" />
      </PanelSectionHeading>
      <ul className={styles.list}>
        {shown.map((t) => (
          <li key={t.slug}>
            <a href={topicHref(t.slug)}><InterfaceText en={t.title.en} he={t.title.he} /></a>
          </li>
        ))}
      </ul>
      {!all && topics.length > initial ? (
        <button type="button" className={styles.more} onClick={() => setAll(true)}>
          <InterfaceText en="More" he="עוד" />
        </button>
      ) : null}
    </section>
  );
}
