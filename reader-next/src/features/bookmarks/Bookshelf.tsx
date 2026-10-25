import { sortedBookmarks, useBookmarks, useBookmarksLoaded } from "~/lib/bookmarks";
import { bookOf } from "~/lib/bookmarks/layout";
import { refToUrl } from "~/lib/ref/url";
import { Link } from "~/ui/Link/Link";
import styles from "./Bookshelf.module.css";
import { requestLayoutEntry } from "./layout-entry";

const SHOWN = 6;

/** The books the reader is in the middle of, on the library's front page; each opens where they are, in their saved layout. */
export function Bookshelf() {
  const loaded = useBookmarksLoaded();
  const state = useBookmarks();
  const books = sortedBookmarks(state);
  if (!loaded || !books.length) return null;
  return (
    <section className={styles.shelf} aria-labelledby="bookshelf-title">
      <div className={styles.head}>
        <h2 id="bookshelf-title" className={styles.title}>Continue learning</h2>
        {books.length > SHOWN ? <Link href="/bookmarks">All {books.length}</Link> : <Link href="/bookmarks">Bookmarks</Link>}
      </div>
      <ul className={styles.cards}>
        {books.slice(0, SHOWN).map((b) => (
          <li key={b.book}>
            <Link className={styles.card} href={`/${refToUrl(b.ref)}`} onClick={() => requestLayoutEntry(bookOf(b.ref))}>
              <span className={styles.book}>{b.book}</span>
              <span className={styles.where}>{b.ref}</span>
              {b.layout ? <span className={styles.layout}>with your layout</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
