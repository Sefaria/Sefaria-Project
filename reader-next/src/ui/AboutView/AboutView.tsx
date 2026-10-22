import type { MouseEvent } from "react";
import type { DownloadableVersion } from "../DownloadVersions/DownloadVersions";
import { DownloadVersions } from "../DownloadVersions/DownloadVersions";
import type { IndexDetails } from "~/lib/catalog/index-details";
import { markdownToHtml } from "~/lib/html/markdown";
import type { LabelLang } from "~/lib/reader/labels";
import type { VersionMeta } from "~/lib/text/model";
import { authorsFor, composedLine, descriptionFor, showsAuthors, type AboutVersions } from "~/lib/versions/about";
import { LoadingState } from "../Feedback/Feedback";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { PanelSectionHeading } from "../ConnectionsPanel/FilterRow";
import { RelatedTopics } from "../RelatedTopics/RelatedTopics";
import { AboutVersionBlock } from "./AboutVersionBlock";
import styles from "./AboutView.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export interface AboutViewProps {
  details?: IndexDetails;
  loading?: boolean;
  /** The book's category, in both languages ("Tanakh"). */
  category?: { en: string; he: string };
  /** Language the book's own content (description, composition) is shown in. */
  lang: LabelLang;
  titleHref: string;
  authorHref: (slug: string) => string;
  topicHref: (slug: string) => string;
  versions: AboutVersions;
  /** Which version section leads. */
  order: ("translation" | "source")[];
  urlRef: string;
  /** Version actions: Select a source version; preview a version in the sidebar. */
  selectSourceHref: (v: VersionMeta) => string;
  onSelectSource?: (v: VersionMeta, e: MouseEvent) => void;
  openHref: (v: VersionMeta) => string;
  onOpen?: (v: VersionMeta, e: MouseEvent) => void;
  /** Every version of the whole book, for the download form. */
  bookVersions: readonly DownloadableVersion[];
  isDictionary?: boolean;
}

/**
 * The About box: the book's title, category, authors, description and composition; the current translation (and
 * source version) with notes and facts; the other source versions with Select; related topics; downloads.
 * VERIFIED against sefaria.org 2026-10-05 (Genesis, Berakhot, Rashi on Genesis).
 *
 * @feature CON-039 About this text box
 * @feature VER-006 Current and alternate source versions in About
 * @feature VER-016 Version block display
 */
export function AboutView(p: AboutViewProps) {
  const d = p.details;
  const desc = d ? descriptionFor(d, p.lang) : undefined;
  const composed = d ? composedLine(d, p.lang) : undefined;
  const authors = d && showsAuthors(d) ? authorsFor(d, p.lang) : [];
  const { translation, source, alternates, alternatesAreAll } = p.versions;

  const block = (kind: "translation" | "source") => {
    const v = kind === "translation" ? translation : source;
    if (!v) return null;
    return (
      <section key={kind} aria-label={kind === "translation" ? "Current Translation" : "Current Version"}>
        <PanelSectionHeading variant="title">
          {kind === "translation" ? <InterfaceText en="Current Translation" he="תרגום נוכחי" /> : <InterfaceText en="Current Version" he="מהדורה נוכחית" />}
        </PanelSectionHeading>
        <AboutVersionBlock version={v} urlRef={p.urlRef} openHref={p.openHref(v)} onOpen={(e) => p.onOpen?.(v, e)} />
      </section>
    );
  };

  return (
    <div className={styles.view}>
      <section aria-label="About This Text" className={styles.details}>
        <PanelSectionHeading variant="title">
          <InterfaceText en="About This Text" he="אודות ספר זה" />
        </PanelSectionHeading>
        {p.loading && !d ? <LoadingState /> : null}
        {d ? (
          <>
            <a href={p.titleHref} className={styles.title} lang={p.lang} dir={p.lang === "he" ? "rtl" : "ltr"}>{p.lang === "he" ? d.heTitle : d.title}</a>
            {p.category ? <span className={styles.category}><InterfaceText en={p.category.en} he={p.category.he} /></span> : null}
            {authors.length ? (
              <div className={styles.authors}>
                <span className={styles.authorLabel}>{p.lang === "he" ? "מחבר:" : "Author:"}</span>
                {authors.map((a, i) => (
                  <span key={a.slug}>{i > 0 ? ", " : ""}<a href={p.authorHref(a.slug)}>{a[p.lang]}</a></span>
                ))}
              </div>
            ) : null}
            {desc ? <div className={styles.desc} lang={p.lang} dangerouslySetInnerHTML={{ __html: markdownToHtml(desc, { baseUrl: SITE_ORIGIN }) }} /> : null}
            {composed ? <div className={styles.composed}>{composed}</div> : null}
          </>
        ) : null}
      </section>

      {p.order.map(block)}

      {alternates.length ? (
        <section aria-label="Source Versions">
          <PanelSectionHeading variant="title">
            {alternatesAreAll ? <InterfaceText en="Source Versions" he="מהדורות בשפת המקור" /> : <InterfaceText en="Alternate Source Versions" he="מהדורות נוספות בשפת המקור" />}
          </PanelSectionHeading>
          {alternates.map((v) => (
            <AboutVersionBlock
              key={`${v.languageFamilyName}|${v.versionTitle}`}
              version={v}
              urlRef={p.urlRef}
              openHref={p.openHref(v)}
              onOpen={(e) => p.onOpen?.(v, e)}
              select={{ href: p.selectSourceHref(v), onSelect: (e) => p.onSelectSource?.(v, e) }}
            />
          ))}
        </section>
      ) : null}

      <RelatedTopics topics={d?.relatedTopics ?? []} topicHref={p.topicHref} />
      {!p.isDictionary && p.bookVersions.length ? <DownloadVersions title={d?.title ?? ""} versions={p.bookVersions} /> : null}
    </div>
  );
}

