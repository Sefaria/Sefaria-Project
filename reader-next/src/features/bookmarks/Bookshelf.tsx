import { sortedBookmarks, useBookmarks, useBookmarksLoaded } from "~/lib/bookmarks";
import { Icon } from "~/ui/Icon/Icon";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { Link } from "~/ui/Link/Link";
import { VisuallyHidden } from "~/ui/VisuallyHidden/VisuallyHidden";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import styles from "./Bookshelf.module.css";
import { useBookmarkLabels } from "./labels";
import { useBookmarkHref } from "./my-layout";

const SHOWN = 6;

/** The books the reader is in the middle of, on the library's front page; each opens where they are, in their saved layout. */
export function Bookshelf() {
  const loaded = useBookmarksLoaded();
  const state = useBookmarks();
  const books = sortedBookmarks(state);
  const hrefOf = useBookmarkHref();
  const labelsOf = useBookmarkLabels();
  const he = useInterfaceLang() === "hebrew";
  if (!loaded || !books.length) return null;
  return (
    <section className={styles.shelf} aria-labelledby="bookshelf-title">
      <div className={styles.head}>
        <h2 id="bookshelf-title" className={styles.title}>
          <InterfaceText en="Continue learning" he="המשך לימוד" />
        </h2>
        <Link className={styles.all} href="/bookmarks">
          {books.length > SHOWN ? <InterfaceText en={`All ${books.length}`} he={`כל ה־${books.length}`} /> : <InterfaceText en="Bookmarks" he="סימניות" />}
        </Link>
      </div>
      <ul className={styles.cards}>
        {books.slice(0, SHOWN).map((b) => {
          const l = labelsOf(b);
          return (
            <li key={b.book} className={styles.item}>
              <Link className={styles.card} href={hrefOf(b)} style={{ ["--_line" as string]: l.color }}>
                <span className={styles.book} lang={l.titleLang}>{l.title}</span>
                <span className={styles.place} lang={l.titleLang}>{l.place}</span>
                <span className={styles.meta}>
                  <span className={styles.when}>
                    {b.layout ? (
                      <span className={styles.layout} title={he ? "נפתח בפריסה שלך" : "Opens with your layout"}>
                        <Icon name="saved-layout" size="16px" />
                        <VisuallyHidden>{he ? "בפריסה שלך" : "with your layout"}</VisuallyHidden>
                      </span>
                    ) : null}
                    {l.lastRead}
                  </span>
                  <span className={styles.go}>
                    <span className={styles.goText}><InterfaceText en="Continue" he="המשך" /></span>
                    <Icon name="arrow-right" size="16px" className={styles.arrow} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
