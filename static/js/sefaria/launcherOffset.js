// Lifts the Library Assistant's floating button above a bar fixed to the bottom of the
// screen (the cookie banner) by publishing the bar's height as --lc-launcher-bottom-offset,
// which the widget adds to the button's distance from the bottom. Returns a function that
// stops tracking and puts the button back.
export const LAUNCHER_OFFSET = '--lc-launcher-bottom-offset';

export function liftLauncherAbove(el) {
  const root = document.documentElement;
  if (!el || typeof ResizeObserver === 'undefined') { return () => {}; }
  const observer = new ResizeObserver(() => root.style.setProperty(LAUNCHER_OFFSET, `${el.offsetHeight}px`));
  observer.observe(el);
  return () => {
    observer.disconnect();
    root.style.removeProperty(LAUNCHER_OFFSET);
  };
}
