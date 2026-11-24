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
import { setSolePanelClose } from "~/lib/reader/sole-panel-close";
import styles from "./SurfaceBeside.module.css";

const SurfaceBesideMount = lazy(() => import("./SurfaceMount").then((m) => ({ default: m.SurfaceBesideMount })));

/** Is a text open beside the social page (and the lab on)? */
export function useBeside(): boolean {
  const on = useLab("social");
  const loc = useLocation();
  return on && isBeside({ pathname: loc.pathname, search: loc.searchStr ?? "" });
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
