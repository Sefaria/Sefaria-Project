// Keeps a bar fixed to the bottom of the screen (the cookie banner) from covering the page by
// publishing the bar's height on :root as
//   --bottom-bar-height, which the layout reserves at the bottom of the app and the mobile menu
//     (mobile widths only; see cookies-notification.scss), and
//   --lc-launcher-bottom-offset, which the Library Assistant's widget adds to its floating
//     button's distance from the bottom.
// Returns a function that stops tracking and gives the space back.
export const BOTTOM_BAR_HEIGHT = '--bottom-bar-height';
export const LAUNCHER_OFFSET = '--lc-launcher-bottom-offset';
const PROPERTIES = [BOTTOM_BAR_HEIGHT, LAUNCHER_OFFSET];

export function reserveBottomBar(el) {
  const root = document.documentElement;
  if (!el || typeof ResizeObserver === 'undefined') { return () => {}; }
  const observer = new ResizeObserver(() => {
    PROPERTIES.forEach(property => root.style.setProperty(property, `${el.offsetHeight}px`));
  });
  observer.observe(el);
  return () => {
    observer.disconnect();
    PROPERTIES.forEach(property => root.style.removeProperty(property));
  };
}
