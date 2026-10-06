import { entitiesOf, type EntityAnswer, type EntityTopic } from "~/lib/connections/entity";
import { markdownToHtml } from "~/lib/html/markdown";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Icon } from "../Icon/Icon";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { LoadingState } from "../Feedback/Feedback";
import styles from "./NamedEntityView.module.css";

export interface NamedEntityViewProps {
  /** What the API said about the name; undefined while loading. */
  answer?: EntityAnswer;
  /** The words as they stand in the text ("Rabban Gamliel"), named when the name is ambiguous. */
  text: string;
  /** Where a topic's own page is (a new tab). */
  topicHref: (slug: string) => string;
  /** The line under the three dots: why this topic is connected to the passage. */
  sourceNote: string;
}

/**
 * The sidebar for a name clicked in the text: the topic's title (a link to its page), its time period, its description. A
 * name that could be several people lists each, after '"…" could refer to one of the following:'.
 *
 * @feature CON-045 Named entity popup in sidebar
 */
export function NamedEntityView({ answer, text, topicHref, sourceNote }: NamedEntityViewProps) {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  if (!answer) return <LoadingState />;
  const entities = entitiesOf(answer);
  const ambiguous = Boolean(answer.possibilities);
  return (
    <div className={styles.view}>
      {ambiguous ? (
        <p className={styles.ambiguous}>
          <InterfaceText en={`"${text}" could refer to one of the following:`} he={`ייתכן ש-"${text}" מתייחס לאחד מהבאים:`} />
        </p>
      ) : null}
      {entities.map((e) => (
        <Entity key={e.slug} e={e} he={he} href={topicHref(e.slug)} sourceNote={sourceNote} />
      ))}
    </div>
  );
}

function Entity({ e, he, href, sourceNote }: { e: EntityTopic; he: boolean; href: string; sourceNote: string }) {
  const code = he ? "he" : "en";
  const desc = e.description ? (he ? e.description.he || e.description.en : e.description.en) : he ? `לא קיים מידע עבור '${e.primaryTitle.he}'` : `No description known for '${e.primaryTitle.en}'`;
  return (
    <section className={styles.entity} aria-label={e.primaryTitle.en}>
      <div className={styles.bar}>
        <a className={styles.title} lang={code} href={href} target="_blank" rel="noopener noreferrer">{he ? e.primaryTitle.he : e.primaryTitle.en}</a>
        <span className={styles.note} title={sourceNote}><Icon name="dots" label={sourceNote} /></span>
      </div>
      {e.timePeriod ? (
        <div className={styles.period} lang={code}>
          <span>{he ? e.timePeriod.name.he : e.timePeriod.name.en}</span>
          <span>{(he ? e.timePeriod.yearRange.he : e.timePeriod.yearRange.en).trim()}</span>
        </div>
      ) : null}
      <div className={styles.desc} lang={code} dangerouslySetInnerHTML={{ __html: markdownToHtml(desc) }} />
    </section>
  );
}
