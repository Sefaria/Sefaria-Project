/**
 * The reader's chrome insets for SurfaceHost 1.2 `ui.chrome` (contract/surface-host.v1.ts): how many CSS pixels at each edge of
 * the viewport the reader's own chrome occupies, so a surface's floating UI (Sefaria Social's call window) keeps clear of it
 * without reading the reader's markup. The reader marks its chrome with `data-surface-chrome="top" | "bottom" | "inline-start" |
 * "inline-end"` (the site header and sticky panel headers at the top, the connections side panel at the inline end); this
 * measures the marked elements that are showing.
 *
 * @feature SHL-080 SurfaceHost 1.2: the reader's chrome insets (rebuild)
 */
export const CHROME_ATTR = "data-surface-chrome";

export interface ChromeInsets {
  top: number;
  inlineStart: number;
  inlineEnd: number;
  bottom: number;
}

const NONE: ChromeInsets = { top: 0, inlineStart: 0, inlineEnd: 0, bottom: 0 };

/** The insets now. Hidden (no box) and off-screen chrome counts for nothing. */
export function measureChrome(doc: Document, win: Pick<Window, "innerWidth" | "innerHeight">, dir: "ltr" | "rtl"): ChromeInsets {
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  const out = { ...NONE };
  for (const el of doc.querySelectorAll(`[${CHROME_ATTR}]`)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const fromLeft = Math.min(vw, r.right); // covers [0, right]
    const fromRight = vw - Math.max(0, r.left); // covers [left, vw]
    switch (el.getAttribute(CHROME_ATTR)) {
      case "top":
        out.top = Math.max(out.top, Math.min(vh, r.bottom));
        break;
      case "bottom":
        out.bottom = Math.max(out.bottom, vh - Math.max(0, r.top));
        break;
      case "inline-start":
        out.inlineStart = Math.max(out.inlineStart, dir === "ltr" ? fromLeft : fromRight);
        break;
      case "inline-end":
        out.inlineEnd = Math.max(out.inlineEnd, dir === "ltr" ? fromRight : fromLeft);
        break;
    }
  }
  return { top: Math.round(out.top), inlineStart: Math.round(out.inlineStart), inlineEnd: Math.round(out.inlineEnd), bottom: Math.round(out.bottom) };
}

export interface ChromeInsetsSource {
  get(): ChromeInsets;
  subscribe(cb: () => void): () => void;
  dispose(): void;
}

const same = (a: ChromeInsets, b: ChromeInsets) =>
  a.top === b.top && a.inlineStart === b.inlineStart && a.inlineEnd === b.inlineEnd && a.bottom === b.bottom;

/**
 * Live insets: re-measured (coalesced to one frame) on resize, scroll, marked chrome appearing or going, and marked elements
 * changing size; subscribers hear only real changes. Watches nothing until someone subscribes.
 */
export function createChromeInsets({ doc, win, dir }: { doc: Document; win: Window; dir: () => "ltr" | "rtl" }): ChromeInsetsSource {
  let value = measureChrome(doc, win, dir());
  const subs = new Set<() => void>();
  let pending = false;
  let teardown: (() => void) | null = null;
  const frame = (fn: () => void) =>
    typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame(fn) : win.setTimeout(fn, 16);

  const update = () => {
    pending = false;
    const next = measureChrome(doc, win, dir());
    if (same(next, value)) return;
    value = next;
    for (const cb of [...subs]) cb();
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    frame(update);
  };

  function start() {
    win.addEventListener("resize", schedule);
    win.addEventListener("scroll", schedule, { capture: true, passive: true });
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    const observeMarked = () => doc.querySelectorAll(`[${CHROME_ATTR}]`).forEach((el) => resize?.observe(el));
    observeMarked();
    const mutations = new MutationObserver(() => {
      observeMarked();
      schedule();
    });
    mutations.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: [CHROME_ATTR, "hidden"] });
    teardown = () => {
      win.removeEventListener("resize", schedule);
      win.removeEventListener("scroll", schedule, { capture: true });
      resize?.disconnect();
      mutations.disconnect();
    };
  }

  return {
    get: () => (subs.size ? value : (value = measureChrome(doc, win, dir()))),
    subscribe(cb) {
      if (!subs.size) start();
      subs.add(cb);
      return () => {
        subs.delete(cb);
        if (!subs.size) {
          teardown?.();
          teardown = null;
        }
      };
    },
    dispose() {
      subs.clear();
      teardown?.();
      teardown = null;
    },
  };
}
