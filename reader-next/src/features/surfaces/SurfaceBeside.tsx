/**
 * The shell's half of a text open beside the social page (src/lib/surfaces/beside.ts, contract 1.1 openBeside): while the address is
 * a text with `ctx=social.beside` and the `social` lab is on, the social page's column at the inline start of the page row and the
 * control that closes the text. The server renders the empty column (the text beside it does not move when the page arrives); after
 * hydration the column gets the page view's element (SurfaceMount.tsx, its own chunk), moved from /social still mounted.
 *
 * @feature SHL-079 A text beside the social page
 */
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useLab } from "~/features/reader-state/labs";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { besideCollapsed, isBeside, setBesideCollapsed, subscribeBesideCollapsed, withTransition } from "~/lib/surfaces/beside";
import { parseUrlRef, urlToRef } from "~/lib/ref/url";
import { scrollSegmentToLine } from "~/lib/reader-state/sefaria/slices/dom-position";
import { setSolePanelClose } from "~/lib/reader/sole-panel-close";
import styles from "./SurfaceBeside.module.css";

const SurfaceBesideMount = lazy(() => import("./SurfaceMount").then((m) => ({ default: m.SurfaceBesideMount })));

/** Is a text open beside the social page (and the lab on)? */
export function useBeside(): boolean {
  const on = useLab("social");
  const loc = useLocation();
  return on && isBeside({ pathname: loc.pathname, search: loc.searchStr ?? "" });
}

/** Is the text beside the social page collapsed to its rail (src/lib/surfaces/beside.ts)? */
export const useBesideCollapsed = (): boolean => useSyncExternalStore(subscribeBesideCollapsed, besideCollapsed, () => false);

/** The first verse an address names ("/Exodus.3.11-14" is "Exodus 3:11"), or null for a page that is not a text. */
function segmentOf(pathname: string): string | null {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return null;
  const { title, sections } = parseUrlRef(first);
  return title ? (sections.length ? `${title} ${sections.join(":")}` : title) : null;
}

/** Collapse or expand the text, as a view transition (the text slides out to its rail, or back in). */
function setCollapsed(next: boolean) {
  void withTransition(async () => {
    flushSync(() => setBesideCollapsed(next));
    if (next && window.matchMedia?.("(max-width: 842px)").matches) window.scrollTo(0, 0); // a phone's window was in the text: show the page from its top
    if (!next) placeAtAddress();
  }, next ? "close" : "open").then(() => {
    if (next || besideCollapsed()) return;
    // the column's size changed and the reading engine puts back the place it last knew (before the collapse) on its resize: once that
    // has run, the address's verse again
    requestAnimationFrame(() => requestAnimationFrame(placeAtAddress));
  });
}

/**
 * While collapsed the text did not scroll (a hidden reader never moves the window: dom-position.ts, use-reading-scroll.ts), so a
 * followed shiur's moves changed only its address: bring the address's verse to the reading line.
 */
function placeAtAddress() {
  const main = document.getElementById("main");
  const ref = segmentOf(window.location.pathname);
  if (main && ref && !scrollSegmentToLine(main, ref)) scrollSegmentToLine(main, `${ref}:1`);
}

/** The social page's column beside the text. */
let hydratedOnce = false;

export function SurfaceBesidePane() {
  // after the first hydration, a pane mounted by a navigation renders its content at once (the page's element is waiting for it)
  const [hydrated, setHydrated] = useState(hydratedOnce);
  useEffect(() => {
    hydratedOnce = true;
    setHydrated(true);
  }, []);
  // closing the text forgets a collapse: the next text opened beside the page comes in expanded
  useEffect(() => () => setBesideCollapsed(false), []);
  const lang = useInterfaceLang();
  return (
    // data-reader-state-ui: reading or scrolling the feed beside a followed shiur is not the person moving the reader (follow me
    // breaks away on the person's own input: src/lib/reader-state/sefaria/host.ts onLocalInput)
    <aside className={styles.pane} aria-label={lang === "hebrew" ? "רשת חברתית" : "Social"} data-social-beside="pane" data-reader-state-ui="">
      {hydrated && (
        <Suspense fallback={null}>
          <SurfaceBesideMount />
        </Suspense>
      )}
    </aside>
  );
}

/**
 * On a phone, the floating "Back to feed" button (on desktop the text's own close button does it: TextPanel.tsx). Escape closes
 * the text too, unless something used the key first (the panel's own handler, a menu, a dialog, a field).
 */
export function SurfaceBesideClose() {
  const router = useRouter();
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const label = { en: "Close the text and go back to the feed", he: "סגירת הטקסט וחזרה לפיד" };
  const close = () => void import("~/lib/surfaces/beside").then((m) => m.closeBeside(router as never));
  // on desktop the text's own close button does it (TextPanel.tsx reads this)
  useEffect(() => setSolePanelClose({ label, close }), [router]); // eslint-disable-line react-hooks/exhaustive-deps -- label and close are stable for a router
  // Escape closes it too, unless something on the page used the key first (a menu, a dialog, the sidebar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog], dialog, [aria-modal=true]")) return;
      if (document.querySelector("[role=dialog], dialog[open], [aria-modal=true]")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <button type="button" className={styles.close} onClick={close} aria-label={he ? label.he : label.en} data-social-beside="close">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span>{he ? "חזרה לפיד" : "Back to feed"}</span>
    </button>
  );
}

/**
 * Collapse the text to a rail at the inline end, so the social page takes the room, and expand it again. Expanded: a small tab on the
 * seam between the page and the text (on a phone, a floating "Hide text" button beside "Back to feed"). Collapsed: the rail (on a
 * phone, a floating pill) names the text it holds, which stays mounted and keeps following a shiur underneath. Both are marked as
 * reader-state controls, so pressing them never counts as breaking away from the leader.
 */
export function SurfaceBesideToggle() {
  const collapsed = useBesideCollapsed();
  const loc = useLocation();
  const he = useInterfaceLang() === "hebrew";
  const first = loc.pathname.split("/").filter(Boolean)[0];
  const title = first ? urlToRef(first) : "";
  if (collapsed) {
    const label = he ? `הצגת הטקסט${title ? `: ${title}` : ""}` : `Show the text${title ? `: ${title}` : ""}`;
    return (
      <button type="button" className={styles.rail} onClick={() => setCollapsed(false)} aria-expanded="false" aria-controls="main" aria-label={label} title={label} data-social-beside="expand" data-reader-state-ui="">
        <Chevron />
        <span className={styles.railTitle} dir="auto">{title || (he ? "טקסט" : "Text")}</span>
      </button>
    );
  }
  const label = he ? "הסתרת הטקסט בצד" : "Hide the text to the side";
  return (
    <button type="button" className={styles.collapse} onClick={() => setCollapsed(true)} aria-expanded="true" aria-controls="main" aria-label={label} title={label} data-social-beside="collapse" data-reader-state-ui="">
      <Chevron />
      <span className={styles.collapseLabel}>{he ? "הסתרת הטקסט" : "Hide text"}</span>
    </button>
  );
}

/** A chevron pointing to the inline start (mirrored in RTL); the stylesheet turns it toward the end on the collapse tab. */
function Chevron() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
