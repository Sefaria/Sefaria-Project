import { removeBookmark, resetFurthest, setBookmarkMode, setDefaultBookmarkMode, sortedBookmarks, useBookmarks, useBookmarksLoaded, type Bookmark } from "~/lib/bookmarks";
import { refToUrl } from "~/lib/ref/url";
import { Button } from "~/ui/Button/Button";
import { EmptyState } from "~/ui/Feedback/Feedback";
import { Icon } from "~/ui/Icon/Icon";
import { IconButton } from "~/ui/IconButton/IconButton";
import { Link } from "~/ui/Link/Link";
import { ModeSwitch, modeHint } from "./ModeSwitch";
import styles from "./BookmarksPage.module.css";
import { bookOf } from "~/lib/bookmarks/layout";
import { requestLayoutEntry } from "./layout-entry";

function Row({ bookmark: b }: { bookmark: Bookmark }) {
  const ahead = b.mode === "auto" && b.furthest && b.furthest !== b.ref ? b.furthest : undefined;
  return (
    // Going back to the book from here opens its saved layout.
    <li className={styles.row} onClickCapture={(e) => (e.target as Element).closest("a") && requestLayoutEntry(bookOf(b.ref))}>
      <div className={styles.main}>
        <h2 className={styles.book}>{b.book}</h2>
        <p className={styles.where}>
          You're at <Link href={`/${refToUrl(b.ref)}`}>{b.ref}</Link>
          {ahead ? (
            <span className={styles.furthest}>
              {" · furthest: "}
              <Link href={`/${refToUrl(ahead)}`}>{ahead}</Link>
              <button type="button" className={styles.reset} onClick={() => resetFurthest(b.book)}>
                reset
              </button>
            </span>
          ) : null}
        </p>
      </div>
      <div className={styles.controls}>
        <ModeSwitch value={b.mode} onChange={(m) => setBookmarkMode(b.book, m)} label={`Bookmark mode for ${b.book}`} />
        <Button href={`/${refToUrl(b.ref)}`} size="sm" variant="primary">
          Continue
        </Button>
        <IconButton icon="close" size="sm" label={`Remove bookmark for ${b.book}`} onClick={() => removeBookmark(b.book)} />
      </div>
    </li>
  );
}

/** /bookmarks: one bookmark per book, where you are in each, and a way back in. */
export function BookmarksPage() {
  const state = useBookmarks();
  const loaded = useBookmarksLoaded();
  const list = sortedBookmarks(state);
  if (!loaded) return <div className={styles.page} />;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Bookmarks</h1>
        {list.length ? (
          <div className={styles.default}>
            <span>New bookmarks</span>
            <ModeSwitch value={state.defaultMode} onChange={setDefaultBookmarkMode} label="Mode for new bookmarks" />
          </div>
        ) : null}
      </header>
      {list.length ? (
        <>
          <ul className={styles.list}>
            {list.map((b) => (
              <Row key={b.book} bookmark={b} />
            ))}
          </ul>
          <p className={styles.legend}>
            Manual: {modeHint("manual").toLowerCase()} Auto: {modeHint("auto").toLowerCase()}
          </p>
        </>
      ) : (
        <EmptyState
          title="No bookmarks yet"
          action={
            <Button href="/texts" size="sm">
              Browse the library
            </Button>
          }
        >
          While reading, tap <Icon name="star" size="1em" /> in the text's header to bookmark that book. You get one bookmark per book.
        </EmptyState>
      )}
    </div>
  );
}
