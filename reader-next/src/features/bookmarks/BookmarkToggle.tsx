import { useState } from "react";
import { addBookmark, moveBookmark, removeBookmark, setBookmarkMode, useBookmark } from "~/lib/bookmarks";
import { Button } from "~/ui/Button/Button";
import { Icon } from "~/ui/Icon/Icon";
import { IconButton } from "~/ui/IconButton/IconButton";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { Link } from "~/ui/Link/Link";
import { Popover } from "~/ui/Popover/Popover";
import { bookOf, layoutHasCompanions, layoutSearchOf, standardWorkspace } from "~/lib/bookmarks/layout";
import { panelAt, panelOrder } from "~/lib/workspace/ops";
import { useReaderSettings } from "../reader/settings-context";
import { urlDefaultsFor, useWorkspaceNav } from "../workspace/navigation";
import { ModeHint, ModeSwitch } from "./ModeSwitch";
import { useBookmarkLabels } from "./labels";
import { useLayoutAutosave, useOpenMyLayout } from "./my-layout";
import styles from "./BookmarkToggle.module.css";

/**
 * The text panel's bookmark button. Clicking it on an unbookmarked book bookmarks the segment being read, keeps the
 * arrangement on screen as the bookmark's layout, and opens a small card; on a bookmarked book it opens the card, which moves,
 * re-modes or removes the bookmark and switches between My layout and the standard one. In the main panel (`main`) the
 * arrangement saves to the bookmark as it changes while My layout is on.
 */
export function BookmarkToggle({ book, at, main = false }: { book: string; at: string; main?: boolean }) {
  const bookmark = useBookmark(book);
  const nav = useWorkspaceNav();
  const { settings } = useReaderSettings();
  const [open, setOpen] = useState(false);
  useLayoutAutosave(book, main);
  const openMine = useOpenMyLayout(book);
  const labelsOf = useBookmarkLabels();
  const labels = bookmark ? labelsOf(bookmark) : undefined;
  const ws = nav.current();
  const showsBook = (() => {
    const ref = panelAt(ws, 0)?.ref;
    return Boolean(ref && bookOf(ref) === bookOf(at));
  })();
  const mine = main && showsBook && Boolean(ws.bk);
  const savedHasMore = Boolean(bookmark?.layout && layoutHasCompanions(bookmark.layout.search));
  const change = (next: boolean) => {
    if (next && !bookmark) {
      const layout = showsBook ? { search: layoutSearchOf(ws, urlDefaultsFor(settings)) } : undefined;
      addBookmark(book, at, layout);
      if (layout && layoutHasCompanions(layout.search)) nav.go(ws, { replace: true, bk: true, state: { nav: "stay" } });
    }
    setOpen(next);
  };
  const toStandard = () => {
    setOpen(false);
    nav.go(standardWorkspace(nav.current()), { bk: false, state: { nav: "stay", panel: "p1" } });
  };
  const toMine = () => {
    setOpen(false);
    void openMine?.(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={change}
      label={`Bookmark for ${book}`}
      trigger={(p) => (
        <IconButton
          {...p}
          icon="bookmark"
          pressed={Boolean(bookmark)}
          label={bookmark ? (mine ? `${book} is bookmarked, in your layout` : `${book} is bookmarked`) : `Bookmark ${book}`}
        />
      )}
    >
      {bookmark ? (
        <div className={styles.card}>
          <div className={styles.head}>
            <Icon name="bookmark" filled size="18px" className={styles.mark} />
            <p className={styles.where}>
              <InterfaceText en="Bookmarked at" he="הסימנייה ב־" /> <strong lang={labels?.titleLang}>{labels?.titleLang === "he" ? `${labels.title} ${labels.place}` : bookmark.ref}</strong>
            </p>
          </div>
          {bookmark.mode === "manual" && bookmark.ref !== at ? (
            <Button size="sm" variant="primary" block onClick={() => moveBookmark(book, at)}>
              <InterfaceText en="Move bookmark here" he="העברת הסימנייה לכאן" />
            </Button>
          ) : null}
          <div className={styles.mode}>
            <ModeSwitch value={bookmark.mode} onChange={(m) => setBookmarkMode(book, m)} block />
            <p className={styles.hint}><ModeHint mode={bookmark.mode} /></p>
          </div>
          {main && showsBook ? (
            <div className={styles.layout}>
              {mine ? (
                <>
                  <p className={styles.hint}><InterfaceText en="Your layout is saved with this bookmark as you change it." he="הפריסה שלך נשמרת עם הסימנייה בכל שינוי." /></p>
                  {panelOrder(ws).length > 1 ? (
                    <Button size="sm" variant="secondary" block onClick={toStandard}>
                      <Icon name="columns" size="16px" />
                      <InterfaceText en="Switch to the standard layout" he="מעבר לפריסה הרגילה" />
                    </Button>
                  ) : null}
                </>
              ) : savedHasMore ? (
                <>
                  <p className={styles.hint}><InterfaceText en="Showing the standard layout. Your saved layout is kept." he="מוצגת הפריסה הרגילה. הפריסה השמורה שלך לא נמחקה." /></p>
                  <Button size="sm" variant="secondary" block onClick={toMine}>
                    <Icon name="saved-layout" size="16px" />
                    <InterfaceText en="Switch back to my layout" he="חזרה לפריסה שלי" />
                  </Button>
                </>
              ) : (
                <p className={styles.hint}><InterfaceText en="Open a commentary beside the text and it is saved with this bookmark." he="פרשן שתפתחו לצד הטקסט יישמר עם הסימנייה." /></p>
              )}
            </div>
          ) : null}
          <div className={styles.footer}>
            <Link href="/bookmarks" className={styles.link} onClick={() => setOpen(false)}>
              <InterfaceText en="All bookmarks" he="כל הסימניות" />
            </Link>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => {
                removeBookmark(book);
                setOpen(false);
              }}
            >
              <InterfaceText en="Remove" he="הסרה" />
            </Button>
          </div>
        </div>
      ) : null}
    </Popover>
  );
}
