import { useState, type MouseEvent, type ReactNode } from "react";
import { useLibraryHref } from "~/lib/routing/library-href";
import { markdownToHtml } from "~/lib/html/markdown";
import { sanitizeHtml } from "~/lib/html/sanitize";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import type { AboutTextMeta } from "~/lib/book/about-text";
import type { VersionMeta } from "~/lib/text/model";
import { Button } from "../Button/Button";
import { ContentLanguage } from "../ContentLanguage/ContentLanguage";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { Link } from "../Link/Link";
import { NavPage } from "../NavPage/NavPage";
import { SidebarFooter } from "../NavSidebar/NavSidebar";
import styles from "./BookPage.module.css";
import { dirFor } from "~/lib/i18n/direction";
import { encodeTitle } from "~/lib/ref/url";
import { BookVersionRow } from "./BookVersionRow";
import { bookVersionOrder, versionRecords, type BookVersion } from "./version-order";

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
  /** Every version of the text; undefined while loading. Anything that is not a version record (an API error) is left out. */
  versions?: readonly VersionMeta[];
  /** Reading a text in a given version: the version's title links there. */
  versionHref: (v: BookVersion) => string;
  /** Where the site's own pages live ("" = this origin): the digitization page, relative links in version notes. */
  siteOrigin?: string;
  /** Authors and composition shown above the description in the sidebar (LIB-036). */
  meta?: AboutTextMeta;
  /** Book description (markdown) by language; sidebar. `heShort` (the index's heShortDesc) stands in for a missing Hebrew one. */
  description?: { en?: string | null; he?: string | null; heShort?: string | null };
  /** Sidebar modules after the description: related topics, downloads. */
  sidebar?: ReactNode;
  /** The book's top category, for the colour line under the header. */
  colorCategory?: string;
  /** Moderators: the version editor for a version, shown in its block's place (`close` puts the block back). */
  editVersion?: (v: VersionMeta, close: () => void) => ReactNode;
  /**
   * Moderators: the book's admin buttons beside the title (the old CategoryHeader type="books": "Add Section" opens Django's
   * text adder, "Edit" the Index Editor), and the editor itself, shown in place of the page while open.
   */
  admin?: { addSectionHref: string; onAddSection?: (e: MouseEvent<HTMLAnchorElement>) => void; onEdit: () => void; editor?: ReactNode };
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
export function BookPage({ title, category, attribution, dedication, readHref, continueReading, tab, tabHref, onTab, contents, versions, versionHref, siteOrigin, meta, description, sidebar, colorCategory, editVersion, admin }: BookPageProps) {
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const lib = useLibraryHref();
  const code = he ? "he" : "en";
  // the Hebrew interface: the Hebrew description, else the short Hebrew one, before any English (the old AboutBox's
  // `heDesc || heShortDesc`; VERIFIED on sefaria.org.il 2026-11-10: Berakhot shows "ברכות ותפילות, בדגש על קריאת שמע…")
  const heAbout = description?.he || description?.heShort;
  const about = he ? heAbout || description?.en : description?.en || heAbout;
  const aboutLang = about && about === heAbout ? "he" : "en";
  const hasAbout = Boolean(about || meta?.authors.length || meta?.composed);
  const aboutBody = (
    <>
      {meta?.authors.length || meta?.composed ? (
              <div className={styles.meta} lang={code} dir={dirFor(code)}>
                {meta?.authors.length ? (
                  <div>
                    <span className={styles.metaLabel}><InterfaceText en={meta.authors.length === 1 ? "Author" : "Authors"} he={meta.authors.length === 1 ? "מחבר" : "מחברים"} />:</span>{" "}
                    {meta.authors.filter((a) => (he ? a.he : a.en)).map((a, i) => (
                      <span key={a.slug || a.en}>{i ? ", " : ""}<Link href={lib(`/topics/${a.slug}`)}>{he ? a.he : a.en}</Link></span>
                    ))}
                  </div>
                ) : null}
                {meta?.composed && (he ? meta.composed.he : meta.composed.en) ? (
                  <div><span className={styles.metaLabel}><InterfaceText en="Composed" he="זמן חיבור" />:</span> {he ? meta.composed.he : meta.composed.en}</div>
                ) : null}
              </div>
            ) : null}
            {about ? <div className={styles.about} lang={aboutLang} dir={dirFor(aboutLang)} dangerouslySetInnerHTML={{ __html: markdownToHtml(about) }} /> : null}
    </>
  );
  return (
    <NavPage fluid colorCategory={colorCategory} sidebarLabel={he ? "אודות הספר" : "About this book"} footer={<SidebarFooter />} sidebar={<>
        {hasAbout ? (
          <section className={styles.desktopOnly}>
            <h2 className={styles.sideTitle}><InterfaceText en="About This Text" he="אודות ספר זה" /></h2>
            {aboutBody}
          </section>
        ) : null}
        {sidebar}
      </>}>
      {admin?.editor ?? (
        <ContentLanguage>
          <BookMain aboutInline={hasAbout ? <div className={styles.phoneOnly}>{aboutBody}</div> : undefined} {...{ title, category, attribution, dedication, readHref, continueReading, tab, tabHref, onTab, contents, versions, versionHref, siteOrigin, editVersion, admin }} />
        </ContentLanguage>
      )}
    </NavPage>
  );
}

type BookMainProps = { aboutInline?: ReactNode } & Pick<BookPageProps, "title" | "category" | "attribution" | "dedication" | "readHref" | "continueReading" | "tab" | "tabHref" | "onTab" | "contents" | "versions" | "versionHref" | "siteOrigin" | "editVersion" | "admin">;

/** The header, Start Reading and the tabs: the part of the page the language button turns to Hebrew. */
function BookMain({ aboutInline, title, category, attribution, dedication, readHref, continueReading, tab, tabHref, onTab, contents, versions, versionHref, siteOrigin, editVersion, admin }: BookMainProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const code = he ? "he" : "en";
  const tabs: { id: BookTab; en: string; he: string }[] = [
    { id: "contents", en: "Contents", he: "תוכן" },
    { id: "versions", en: "Versions", he: "מהדורות" },
  ];
  const sorted = bookVersionOrder(versionRecords(versions));
  return (
    <article>
        <h1 className={styles.title} lang={code} dir={dirFor(code)}>{he ? title.he : title.en}</h1>
        {admin ? (
          <div className={styles.adminButtons} role="group" aria-label="Admin">
            <a className={styles.adminButton} href={admin.addSectionHref} onClick={admin.onAddSection}><InterfaceText en="Add Section" he="הוספת קטע" /></a>
            <button type="button" className={styles.adminButton} onClick={admin.onEdit}><InterfaceText en="Edit" he="עריכה" /></button>
          </div>
        ) : null}
        <Link className={styles.category} href={category.href} lang={code} dir={dirFor(code)}>{he ? category.he : category.en}</Link>
        {attribution ? (
          <div className={styles.attribution}>
            <Link href={attribution.href} lang={code} dir={dirFor(code)}>{he ? attribution.he : attribution.en}</Link>
          </div>
        ) : null}
        {dedication && (he ? dedication.he || dedication.en : dedication.en || dedication.he) ? (
          <div className={styles.dedication} dangerouslySetInnerHTML={{ __html: sanitizeHtml((he ? dedication.he || dedication.en : dedication.en || dedication.he)!) }} />
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
              // a mouse press does not focus the tab (the old tabs were not focusable): otherwise the next key press, an arrow to
              // scroll, turns on its focus ring; the keyboard still reaches it with Tab
              onMouseDown={(e) => e.preventDefault()}
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
              sorted.map((v) => {
                const key = `${v.languageFamilyName}|${v.versionTitle}`;
                return editVersion && editing === key ? (
                  <div key={key}>{editVersion(v, () => setEditing(null))}</div>
                ) : (
                  <BookVersionRow key={key} version={v} href={versionHref(v)} bookUrl={encodeTitle(title.en)} origin={siteOrigin} onEdit={editVersion ? () => setEditing(key) : undefined} />
                );
              })
            )}
          </div>
        )}
    </article>
  );
}
