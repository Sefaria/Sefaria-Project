import { useState } from "react";
import { addBookmark, moveBookmark, removeBookmark, setBookmarkMode, useBookmark } from "~/lib/bookmarks";
import { Button } from "~/ui/Button/Button";
import { IconButton } from "~/ui/IconButton/IconButton";
import { Link } from "~/ui/Link/Link";
import { Popover } from "~/ui/Popover/Popover";
import { bookOf, layoutHasCompanions, layoutSearchOf } from "~/lib/bookmarks/layout";
import { panelAt } from "~/lib/workspace/ops";
import { useReaderSettings } from "../reader/settings-context";
import { urlDefaultsFor, useWorkspaceNav } from "../workspace/navigation";
import { ModeSwitch, modeHint } from "./ModeSwitch";
import styles from "./BookmarkToggle.module.css";

/**
 * The text panel's bookmark button. Clicking it on an unbookmarked book bookmarks the segment being read and opens a small
 * card; on a bookmarked book it opens the card, which moves, re-modes or removes the bookmark.
 */
export function BookmarkToggle({ book, at }: { book: string; at: string }) {
  const bookmark = useBookmark(book);
  const nav = useWorkspaceNav();
  const { settings } = useReaderSettings();
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    if (next && !bookmark) {
      // Bookmarking the main text also keeps what's on screen around it as My layout
      const ws = nav.current();
      const main = panelAt(ws, 0)?.ref;
      const layout = main && bookOf(main) === bookOf(at) ? { search: layoutSearchOf(ws, urlDefaultsFor(settings)) } : undefined;
      addBookmark(book, at, layout);
      if (layout && layoutHasCompanions(layout.search)) nav.go(ws, { replace: true, bk: true, state: { nav: "stay" } });
    }
    setOpen(next);
  };
  return (
    <Popover
      open={open}
      onOpenChange={change}
      label={`Bookmark for ${book}`}
      trigger={(p) => <IconButton {...p} icon="bookmark" pressed={Boolean(bookmark)} label={bookmark ? `${book} is bookmarked` : `Bookmark ${book}`} />}
    >
      {bookmark ? (
        <div className={styles.card}>
          <p className={styles.where}>
            Bookmarked at <strong>{bookmark.ref}</strong>
          </p>
          {bookmark.mode === "manual" && bookmark.ref !== at ? (
            <Button size="sm" variant="primary" onClick={() => moveBookmark(book, at)}>
              Move bookmark here
            </Button>
          ) : null}
          <ModeSwitch value={bookmark.mode} onChange={(m) => setBookmarkMode(book, m)} />
          <p className={styles.hint}>{modeHint(bookmark.mode)}</p>
          <div className={styles.footer}>
            <Link href="/bookmarks" className={styles.link} onClick={() => setOpen(false)}>
              All bookmarks
            </Link>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() => {
                removeBookmark(book);
                setOpen(false);
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : null}
    </Popover>
  );
}
