import { removeBookmark, resetFurthest, setBookmarkMode, setDefaultBookmarkMode, sortedBookmarks, useBookmarks, useBookmarksLoaded, type Bookmark } from "~/lib/bookmarks";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { Button } from "~/ui/Button/Button";
import { EmptyState } from "~/ui/Feedback/Feedback";
import { Icon } from "~/ui/Icon/Icon";
import { IconButton } from "~/ui/IconButton/IconButton";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { Link } from "~/ui/Link/Link";
import { ModeHint, ModeSwitch } from "./ModeSwitch";
import styles from "./BookmarksPage.module.css";
import { hebrewPlace, placeOf, useBookmarkLabels } from "./labels";
import { useBookmarkHref } from "./my-layout";

function Row({ bookmark: b }: { bookmark: Bookmark }) {
  const ahead = b.mode === "auto" && b.furthest && b.furthest !== b.ref ? b.furthest : undefined;
  const hrefOf = useBookmarkHref();
  const l = useBookmarkLabels()(b);
  const aheadPlace = ahead ? placeOf({ book: b.book, ref: ahead }) : undefined;
  return (
    <li className={styles.row} style={{ ["--_line" as string]: l.color }}>
      <div className={styles.main}>
        <h2 className={styles.book} lang={l.titleLang}>{l.title}</h2>
        <p className={styles.where}>
          <Link href={hrefOf(b)} className={styles.place} lang={l.titleLang} aria-label={b.ref}>{l.place}</Link>
          <span className={styles.dot} aria-hidden="true">·</span>
          <span>{l.lastRead}</span>
          {b.layout ? (
            <span className={styles.layout} title="Opens with your layout">
              <Icon name="saved-layout" size="16px" label="with your layout" />
            </span>
          ) : null}
        </p>
        {ahead ? (
          <p className={styles.furthest}>
            <InterfaceText en="Furthest:" he="הכי רחוק:" />{" "}
            <Link href={hrefOf(b, ahead)} aria-label={ahead} lang={l.titleLang}>{l.titleLang === "he" ? hebrewPlace(aheadPlace!) : aheadPlace}</Link>
            <button type="button" className={styles.reset} onClick={() => resetFurthest(b.book)}>
              <InterfaceText en="reset" he="איפוס" />
            </button>
          </p>
        ) : null}
      </div>
      <div className={styles.controls}>
        <span className={styles.mode}>
          <ModeSwitch value={b.mode} onChange={(m) => setBookmarkMode(b.book, m)} label={`Bookmark mode for ${b.book}`} />
        </span>
        <span className={styles.actions}>
          <Button href={hrefOf(b)} size="sm" variant="secondary">
            <InterfaceText en="Continue" he="המשך" />
          </Button>
          <IconButton icon="close" size="sm" label={`Remove bookmark for ${b.book}`} onClick={() => removeBookmark(b.book)} />
        </span>
      </div>
    </li>
  );
}

/** /bookmarks: one bookmark per book, where you are in each, and a way back in. */
export function BookmarksPage() {
  const state = useBookmarks();
  const loaded = useBookmarksLoaded();
  const he = useInterfaceLang() === "hebrew";
  const list = sortedBookmarks(state);
  if (!loaded) return <div className={styles.page} />;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>
          <InterfaceText en="Bookmarks" he="סימניות" />
        </h1>
        {list.length ? <span className={styles.count}>{list.length}</span> : null}
      </header>
      {list.length ? (
        <>
          <ul className={styles.list}>
            {list.map((b) => (
              <Row key={b.book} bookmark={b} />
            ))}
          </ul>
          <footer className={styles.settings}>
            <div className={styles.default}>
              <span><InterfaceText en="New bookmarks" he="סימניות חדשות" /></span>
              <ModeSwitch value={state.defaultMode} onChange={setDefaultBookmarkMode} label="Mode for new bookmarks" />
            </div>
            <dl className={styles.legend}>
              <div>
                <dt><InterfaceText en="Manual" he="ידנית" /></dt>
                <dd><ModeHint mode="manual" /></dd>
              </div>
              <div>
                <dt><InterfaceText en="Auto" he="אוטומטית" /></dt>
                <dd><ModeHint mode="auto" /></dd>
              </div>
            </dl>
          </footer>
        </>
      ) : (
        <EmptyState
          title={he ? "אין עדיין סימניות" : "No bookmarks yet"}
          action={
            <Button href="/texts" size="sm">
              <InterfaceText en="Browse the library" he="עיון בספריה" />
            </Button>
          }
        >
          {he ? (
            <>בזמן הקריאה, לחצו על <Icon name="bookmark" size="1em" /> בכותרת הטקסט כדי לסמן את הספר. לכל ספר סימנייה אחת.</>
          ) : (
            <>While reading, tap <Icon name="bookmark" size="1em" /> in the text's header to bookmark that book. You get one bookmark per book.</>
          )}
        </EmptyState>
      )}
    </div>
  );
}
