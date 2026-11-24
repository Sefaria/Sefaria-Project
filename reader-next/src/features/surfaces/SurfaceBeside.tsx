/**
 * The shell's half of a text open beside the social page (src/lib/surfaces/beside.ts, contract 1.1 openBeside): while the address is
 * a text with `ctx=social.beside` and the `social` lab is on, the social page's column at the inline start of the page row and the
 * control that closes the text. The server renders the empty column (the text beside it does not move when the page arrives); after
 * hydration the column gets the page view's element (SurfaceMount.tsx, its own chunk), moved from /social still mounted.
 *
 * @feature SHL-079 A text beside the social page
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useLab } from "~/features/reader-state/labs";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { isBeside } from "~/lib/surfaces/beside";
import styles from "./SurfaceBeside.module.css";

const SurfaceBesideMount = lazy(() => import("./SurfaceMount").then((m) => ({ default: m.SurfaceBesideMount })));

/** Is a text open beside the social page (and the lab on)? */
export function useBeside(): boolean {
  const on = useLab("social");
  const loc = useLocation();
  return on && isBeside({ pathname: loc.pathname, search: loc.searchStr ?? "" });
}

/** The social page's column beside the text. */
export function SurfaceBesidePane() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const lang = useInterfaceLang();
  return (
    <aside className={styles.pane} aria-label={lang === "hebrew" ? "רשת חברתית" : "Social"} data-social-beside="pane">
      {hydrated && (
        <Suspense fallback={null}>
          <SurfaceBesideMount />
        </Suspense>
      )}
    </aside>
  );
}

/** Closes the text and gives the page back its width: on the line between them on desktop, a floating "Feed" button on a phone. */
export function SurfaceBesideClose() {
  const router = useRouter();
  const lang = useInterfaceLang();
  const he = lang === "hebrew";
  const close = () => void import("~/lib/surfaces/host").then((m) => m.closeBeside(router as never));
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
    <button type="button" className={styles.close} onClick={close} aria-label={he ? "סגירת הטקסט וחזרה לפיד" : "Close the text and go back to the feed"} data-social-beside="close">
      <svg className={styles.iconX} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
      <svg className={styles.iconBack} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span className={styles.closeLabel}>{he ? "חזרה לפיד" : "Back to feed"}</span>
    </button>
  );
}
