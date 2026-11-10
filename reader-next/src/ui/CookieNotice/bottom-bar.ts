/**
 * Keeps a bar fixed to the bottom of the screen (the cookie notice) from covering the page, as the old client's
 * static/js/sefaria/launcherOffset.js (master #3948): the bar's height is published on :root as
 *  - --bottom-bar-height: the app shell and the phone menu reserve it at their bottom (phone widths only: CookieNotice.module.css,
 *    MobileNav.module.css, features/shell/App.module.css);
 *  - --lc-launcher-bottom-offset: the Library Assistant's widget adds it to its floating button's distance from the bottom (tablet and
 *    wider force it to 0, where the notice is a corner card clear of the button).
 * Returns a function that stops tracking and gives the space back.
 *
 * @feature GUI-007 Cookie notice
 */
export const BOTTOM_BAR_HEIGHT = "--bottom-bar-height";
export const LAUNCHER_OFFSET = "--lc-launcher-bottom-offset";
const PROPERTIES = [BOTTOM_BAR_HEIGHT, LAUNCHER_OFFSET];

export function reserveBottomBar(el: HTMLElement | null, root: HTMLElement = document.documentElement): () => void {
  if (!el || typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() => {
    root.style.setProperty(BOTTOM_BAR_HEIGHT, `${el.offsetHeight}px`);
    // tablet and wider: a corner card, clear of the button. Also set here, not only in CSS (`:root:has(…)`), for browsers without :has()
    const wide = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 843px)").matches;
    root.style.setProperty(LAUNCHER_OFFSET, wide ? "0px" : `${el.offsetHeight}px`);
  });
  observer.observe(el);
  return () => {
    observer.disconnect();
    for (const p of PROPERTIES) root.style.removeProperty(p);
  };
}
