import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { ConnectionsView } from "~/lib/connections/url";

/** Lists whose place is kept (old isScrollMonitored: ConnectionsList, WebPages, Sheets). Sheets is Voices'. */
const monitored = (v: ConnectionsView) => v.view === "category" || v.view === "webpages";

/**
 * The sidebar's scroll position, as the old ConnectionsPanel (setSideScrollPosition, ConnectionsPanel.jsx:99-130): in a book list
 * (a category's books, Web Pages) the place is remembered as the reader scrolls; coming back to such a list from a text list puts it
 * back; Resources forgets it. Any other change of view starts at the top (the panel's body is one element: it kept the last view's
 * offset). VERIFIED on sefaria.org 2026-11-10 (Genesis 1:1, Commentary: scrolled 300 → Sforno at the top → back at 300; through
 * Resources → 0).
 *
 * @feature CON-037 Sidebar scroll position restore
 * @feature SHL-051 Connection filter state management
 */
export function useSidebarScroll(root: RefObject<HTMLElement | null>, view: ConnectionsView): void {
  const remembered = useRef<number | null>(null);
  // the offset this hook set last: the scroll event that setting it fires is not the reader scrolling
  const set = useRef<number | null>(null);
  const key = JSON.stringify(view);
  const body = () => root.current?.querySelector<HTMLElement>("[data-panel-body]") ?? null;

  useLayoutEffect(() => {
    const el = body();
    if (view.view === "resources") remembered.current = null;
    if (!el) return;
    el.scrollTop = monitored(view) && remembered.current !== null ? remembered.current : 0;
    set.current = el.scrollTop;
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- per view (key is its content); `view` and `body` are new each render

  useEffect(() => {
    const el = body();
    if (!el || !monitored(view)) return;
    // a list still loading is shorter than the place to restore: try again as it grows
    const target = remembered.current;
    let ro: ResizeObserver | undefined;
    if (target && el.scrollTop < target && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        if (el.scrollHeight - el.clientHeight >= target) {
          el.scrollTop = target;
          set.current = el.scrollTop;
          ro?.disconnect();
        }
      });
      for (const child of el.children) ro.observe(child);
    }
    const onScroll = () => {
      if (el.scrollTop === set.current) return;
      set.current = null;
      ro?.disconnect();
      remembered.current = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- per view (key is its content); `view` and `body` are new each render
}
