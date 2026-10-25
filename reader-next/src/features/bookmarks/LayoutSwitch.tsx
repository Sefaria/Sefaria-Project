import { useLocation, useRouter } from "@tanstack/react-router";
import { isReaderPath } from "~/lib/reader/paths";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { setBookmarkLayout, useBookmark } from "~/lib/bookmarks";
import { bookOf, layoutHasCompanions, layoutModified, layoutSearchOf, placeCompanions, standardWorkspace, workspaceFromLayout } from "~/lib/bookmarks/layout";
import { linksQueryOptions } from "~/lib/connections/queries";
import { sectionOfSegment } from "~/lib/workspace/linked-verses";
import { panelAt, panelOrder } from "~/lib/workspace/ops";
import type { PanelId, Workspace } from "~/lib/workspace/types";
import { IconButton } from "~/ui/IconButton/IconButton";
import { Popover } from "~/ui/Popover/Popover";
import { useReaderSettings } from "../reader/settings-context";
import { entryKey, urlDefaultsFor, useWorkspaceNav } from "../workspace/navigation";
import { takeLayoutEntry } from "./layout-entry";
import styles from "./LayoutSwitch.module.css";

/**
 * Panel 1's layout switch, beside the bookmark star: "My layout" (what the book's bookmark remembers) or "Standard"
 * (the main text alone), with a dot when the layout on screen differs from the saved one. It also opens My layout when the
 * reader arrives at the book in-app (see layout-entry.ts).
 */
export function LayoutSwitch({ panel, book }: { panel: PanelId; book: string }) {
  return panel === "p1" ? <Switch book={book} /> : null;
}

function Switch({ book }: { book: string }) {
  const bookmark = useBookmark(book);
  const nav = useWorkspaceNav();
  const qc = useQueryClient();
  const location = useLocation();
  const router = useRouter();
  const currentKey = () => entryKey(router.state.location.state);
  const { settings } = useReaderSettings();
  const defaults = urlDefaultsFor(settings);
  const [open, setOpen] = useState(false);
  const now = nav.current();
  const saved = bookmark?.layout?.search;
  const savedHasMore = saved !== undefined && layoutHasCompanions(saved);
  const mine = Boolean(now.bk) && saved !== undefined;
  const modified = mine && layoutModified(now, saved, defaults);
  const hasMoreNow = panelOrder(now).length > 1 || (panelAt(now, 0)?.asides.length ?? 0) > 0;

  /** My layout around where panel 1 is now, each companion placed through the links of that verse. */
  const openMine = async (replace: boolean) => {
    if (saved === undefined) return;
    const main = panelAt(nav.current(), 0)?.ref;
    if (!main) return;
    const target: Workspace = workspaceFromLayout(main, saved);
    const from = currentKey();
    const links = panelOrder(target).length > 1 ? await qc.fetchQuery(linksQueryOptions(sectionOfSegment(main))).catch(() => []) : [];
    if (currentKey() !== from) return; // the reader went elsewhere meanwhile
    nav.go(placeCompanions(target, links), { replace, bk: true, state: { nav: "go" } });
  };

  const key = entryKey(location.state);
  useEffect(() => {
    if (!isReaderPath(location.pathname)) return;
    const main = panelAt(nav.current(), 0)?.ref;
    if (!main || !takeLayoutEntry(key, bookOf(main))) return;
    const current = nav.current();
    if (current.bk || panelOrder(current).length > 1 || !savedHasMore) return;
    void openMine(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!bookmark || !(savedHasMore || hasMoreNow || mine)) return null;

  const close = () => setOpen(false);
  const choose = (next: "mine" | "standard") => {
    close();
    if (next === "mine") return void (mine ? undefined : openMine(false));
    if (mine || hasMoreNow) nav.go(standardWorkspace(nav.current()), { bk: false, state: { nav: "stay", panel: "p1" } });
  };
  const save = () => {
    close();
    setBookmarkLayout(book, { search: layoutSearchOf(nav.current(), defaults) });
    if (!mine) nav.go(nav.current(), { replace: true, bk: true, state: { nav: "stay" } });
  };
  const canSave = mine ? modified : hasMoreNow;
  const label = mine ? (modified ? "My layout · modified" : "My layout") : "Standard layout";

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Layout"
      trigger={(p) => (
        <span className={styles.host}>
          <IconButton {...p} icon="saved-layout" pressed={mine} className={styles.button} label={mine ? label : savedHasMore ? "Standard layout · switch to my layout" : label} />
          {modified ? <span className={styles.dot} aria-hidden="true" /> : null}
        </span>
      )}
    >
      <div className={styles.menu}>
        <div role="radiogroup" aria-label="Layout" className={styles.group}>
          <button type="button" role="radio" aria-checked={mine} className={styles.item} disabled={!savedHasMore} onClick={() => choose("mine")}>
            My layout
          </button>
          <button type="button" role="radio" aria-checked={!mine} className={styles.item} onClick={() => choose("standard")}>
            Standard
          </button>
        </div>
        <hr className={styles.rule} />
        <button type="button" className={styles.item} disabled={!canSave} onClick={save}>
          Save layout
        </button>
        <button type="button" className={styles.item} disabled={!modified} onClick={() => (close(), void openMine(false))}>
          Revert to saved
        </button>
        {modified ? <p className={styles.note}>Changes aren't saved until you Save layout.</p> : null}
      </div>
    </Popover>
  );
}
