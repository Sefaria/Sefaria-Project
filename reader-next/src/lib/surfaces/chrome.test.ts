/**
 * SurfaceHost 1.2 `ui.chrome`: the reader's insets for a surface's floating UI (Sefaria Social's call window).
 *
 * @feature SHL-080 SurfaceHost 1.2: the reader's chrome insets (rebuild)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHROME_ATTR, createChromeInsets, measureChrome } from "./chrome";

type Rect = { left: number; top: number; width: number; height: number };
const made: HTMLElement[] = [];
afterEach(() => {
  while (made.length) made.pop()!.remove();
});

function mark(side: string, rect: Rect) {
  const el = document.createElement("div");
  el.setAttribute(CHROME_ATTR, side);
  const r = { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top };
  el.getBoundingClientRect = () => ({ ...r, toJSON: () => r }) as DOMRect;
  document.body.append(el);
  made.push(el);
  return el;
}

const win = { innerWidth: 1280, innerHeight: 800 } as Window;

describe("chrome insets", () => {
  it("measures the header at the top and the side panel at the inline end", () => {
    mark("top", { left: 0, top: 0, width: 1280, height: 60 });
    mark("top", { left: 0, top: 60, width: 860, height: 60 }); // a panel header under it
    expect(measureChrome(document, win, "ltr")).toEqual({ top: 120, inlineStart: 0, inlineEnd: 0, bottom: 0 });
    mark("inline-end", { left: 860, top: 60, width: 420, height: 740 });
    expect(measureChrome(document, win, "ltr")).toEqual({ top: 120, inlineStart: 0, inlineEnd: 420, bottom: 0 });
  });

  it("mirrors in a right-to-left page: the inline end is on the left", () => {
    mark("inline-end", { left: 0, top: 60, width: 420, height: 740 });
    expect(measureChrome(document, win, "rtl").inlineEnd).toBe(420);
    expect(measureChrome(document, win, "ltr").inlineEnd).toBe(1280); // read as ltr it would be the whole width
  });

  it("ignores hidden and scrolled-away chrome", () => {
    mark("top", { left: 0, top: -60, width: 1280, height: 60 }); // scrolled away
    mark("inline-end", { left: 0, top: 0, width: 0, height: 0 }); // hidden
    expect(measureChrome(document, win, "ltr")).toEqual({ top: 0, inlineStart: 0, inlineEnd: 0, bottom: 0 });
  });

  it("notifies subscribers once per change, and not when nothing changed", async () => {
    vi.useFakeTimers();
    try {
      const chrome = createChromeInsets({ doc: document, win: window, dir: () => "ltr" });
      const cb = vi.fn();
      const off = chrome.subscribe(cb);
      expect(chrome.get().top).toBe(0);
      mark("top", { left: 0, top: 0, width: 1280, height: 60 });
      await vi.advanceTimersByTimeAsync(50);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(chrome.get().top).toBe(60);
      window.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(50);
      expect(cb).toHaveBeenCalledTimes(1);
      off();
      chrome.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
