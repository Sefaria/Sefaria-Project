import type { ReactNode } from "react";
import { markdownToHtml } from "~/lib/html/markdown";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { AboutTextMeta } from "~/lib/book/about-text";
import type { VersionMeta } from "~/lib/text/model";
import { AboutVersionBlock } from "../AboutView/AboutVersionBlock";
import { Button } from "../Button/Button";
import { ContentLanguage } from "../ContentLanguage/ContentLanguage";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { categoryColor } from "../tokens/category-color";
import { NavPage } from "../NavPage/NavPage";
import { SidebarFooter } from "../NavSidebar/NavSidebar";
import styles from "./BookPage.module.css";
import { SITE_ORIGIN } from "~/lib/config";

export type BookTab = "contents" | "versions";

export interface BookPageProps {
  title: { en: string; he: string };
  /** Label above the title and where it leads. */
  category: { en: string; he: string; href: string };
  /** The edition credited under the category (the William Davidson Talmud). */
  attribution?: { en: string; he: string; href: string };
  /** HTML from the library, shown under the category (a book's dedication). */
  dedication?: { en?: string; he?: string };
  /** Where reading starts (the first section), or resumes. */
  readHref: string;
  continueReading?: boolean;
  tab: BookTab;
  /** Address of each tab (a real link). */
  tabHref: (tab: BookTab) => string;
  onTab?: (tab: BookTab) => void;
  /** The contents: a TocView. */
  contents: ReactNode;
  /** Every version of the text; undefined while loading. */
  versions?: readonly VersionMeta[];
  /** Reading a text in a given version. */
  versionHref: (v: VersionMeta) => string;
  /** Authors and composition shown above the description in the sidebar (LIB-036). */
  meta?: AboutTextMeta;
  /** Book description (markdown) by language; sidebar. */
  description?: { en?: string | null; he?: string | null };
  /** Sidebar modules after the description: related topics, downloads. */
  sidebar?: ReactNode;
  /** The book's top category, for the colour line under the header. */
  colorCategory?: string;
}

const plain = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

/**
 * A book's own page: title, category, Start Reading, Contents / Versions tabs, and a sidebar with the description,
 * related topics and downloads. Replaces BookPage and its NavSidebar modules (book toc mode).
 *
 * @feature BOK-001 Book page (text table of contents)
 * @feature BOK-002 Book page header and category link
 * @feature BOK-003 Start / Continue Reading button
 * @feature BOK-005 Contents and Versions tabs
 * @feature BOK-006 Book page sidebar
 * @feature BOK-007 Versions list tab
 */
export function BookPage({ title, category, attribution, dedication, readHref, continueReading, tab, tabHref, onTab, contents, versions, versionHref, meta, description, sidebar, colorCategory }: BookPageProps) {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const code = he ? "he" : "en";
  const about = he ? description?.he || description?.en : description?.en || description?.he;
  const hasAbout = Boolean(about || meta?.authors.length || meta?.composed);
  const aboutBody = (
    <>
      {meta?.authors.length || meta?.composed ? (
              <div className={styles.meta} lang={code}>
                {meta?.authors.length ? (
                  <div>
                    <span className={styles.metaLabel}><InterfaceText en={meta.authors.length === 1 ? "Author" : "Authors"} he={meta.authors.length === 1 ? "מחבר" : "מחברים"} />:</span>{" "}
                    {meta.authors.filter((a) => (he ? a.he : a.en)).map((a, i) => (
                      <span key={a.slug || a.en}>{i ? ", " : ""}<a href={`${SITE_ORIGIN}/topics/${a.slug}`}>{he ? a.he : a.en}</a></span>
                    ))}
                  </div>
                ) : null}
                {meta?.composed && (he ? meta.composed.he : meta.composed.en) ? (
                  <div><span className={styles.metaLabel}><InterfaceText en="Composed" he="זמן חיבור" />:</span> {he ? meta.composed.he : meta.composed.en}</div>
                ) : null}
              </div>
            ) : null}
            {about ? <div className={styles.about} dangerouslySetInnerHTML={{ __html: markdownToHtml(about) }} /> : null}
    </>
  );
  return (
    <NavPage colorCategory={colorCategory} sidebarLabel={he ? "אודות הספר" : "About this book"} footer={<SidebarFooter />} sidebar={<>
        {hasAbout ? (
          <section className={styles.desktopOnly}>
            <h2 className={styles.sideTitle}><InterfaceText en="About This Text" he="אודות ספר זה" /></h2>
            {aboutBody}
          </section>
        ) : null}
        {sidebar}
      </>}>
      <ContentLanguage>
        <BookMain aboutInline={hasAbout ? <div className={styles.phoneOnly}>{aboutBody}</div> : undefined} {...{ title, category, attribution, dedication, readHref, continueReading, tab, tabHref, onTab, contents, versions, versionHref }} />
      </ContentLanguage>
    </NavPage>
  );
}

type BookMainProps = { aboutInline?: ReactNode } & Pick<BookPageProps, "title" | "category" | "attribution" | "dedication" | "readHref" | "continueReading" | "tab" | "tabHref" | "onTab" | "contents" | "versions" | "versionHref">;

/** The header, Start Reading and the tabs: the part of the page the language button turns to Hebrew. */
function BookMain({ aboutInline, title, category, attribution, dedication, readHref, continueReading, tab, tabHref, onTab, contents, versions, versionHref }: BookMainProps) {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const code = he ? "he" : "en";
  const tabs: { id: BookTab; en: string; he: string }[] = [
    { id: "contents", en: "Contents", he: "תוכן" },
    { id: "versions", en: "Versions", he: "מהדורות" },
  ];
  const sorted = [...(versions ?? [])].sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || a.versionTitle.localeCompare(b.versionTitle));
  return (
    <article>
        <h1 className={styles.title} lang={code}>{he ? title.he : title.en}</h1>
        <Link className={styles.category} href={category.href} lang={code}>{he ? category.he : category.en}</Link>
        {attribution ? (
          <div className={styles.attribution}>
            <Link href={attribution.href} lang={code}>{he ? attribution.he : attribution.en}</Link>
          </div>
        ) : null}
        {dedication && (he ? dedication.he || dedication.en : dedication.en || dedication.he) ? (
          <div className={styles.dedication} dangerouslySetInnerHTML={{ __html: (he ? dedication.he || dedication.en : dedication.en || dedication.he)! }} />
        ) : null}
        <div>
          <Button href={readHref} variant="primary" className={styles.read}>
            {continueReading ? <InterfaceText en="Continue Reading" he="המשך קריאה" /> : <InterfaceText en="Start Reading" he="התחלת קריאה" />}
          </Button>
        </div>
        {aboutInline}
        <nav className={styles.tabs} aria-label={he ? "לשוניות" : "Book sections"}>
          {tabs.map((t) => (
            <Link
              key={t.id}
              className={styles.tab}
              href={tabHref(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              data-current={tab === t.id || undefined}
              onClick={(e) => {
                if (onTab && plain(e)) {
                  e.preventDefault();
                  onTab(t.id);
                }
              }}
            >
              <InterfaceText en={t.en} he={t.he} />
            </Link>
          ))}
        </nav>
        {tab === "contents" ? (
          contents
        ) : (
          <div className={styles.versions}>
            {versions === undefined ? (
              <InterfaceText en="Loading..." he="טוען..." />
            ) : (
              sorted.map((v) => (
                <AboutVersionBlock key={`${v.languageFamilyName}|${v.versionTitle}`} version={v} urlRef={readHref.replace(/^\//, "")} select={{ href: versionHref(v) }} />
              ))
            )}
          </div>
        )}
    </article>
  );
}
