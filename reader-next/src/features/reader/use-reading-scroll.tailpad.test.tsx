import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useReadingScroll } from "./use-reading-scroll";

/**
 * A column with no layout engine: the scroller, the content and one verse report the geometry a browser would, from a content height
 * the test sets and the padding the hook writes under the content.
 */
function column() {
  const style = document.createElement("style");
  style.textContent = ".content { padding-bottom: 0px; }";
  document.head.append(style);
  const scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  const content = document.createElement("div");
  content.className = "content";
  const verse = document.createElement("div");
  verse.setAttribute("role", "group");
  verse.dataset.ref = "Genesis 1:31";
  content.append(verse);
  scroller.append(content);
  document.body.append(scroller);

  const geo = { contentHeight: 1000, clientHeight: 500, verseY: 900, scrollTop: 0 };
  const pad = () => parseFloat(content.style.paddingBottom || "0") || 0;
  const scrollHeight = () => geo.contentHeight + pad();
  Object.defineProperty(scroller, "clientHeight", { get: () => geo.clientHeight });
  Object.defineProperty(scroller, "scrollHeight", { get: scrollHeight });
  Object.defineProperty(scroller, "scrollTop", {
    get: () => geo.scrollTop,
    set: (v: number) => void (geo.scrollTop = Math.max(0, Math.min(v, scrollHeight() - geo.clientHeight))),
  });
  Object.defineProperty(content, "offsetHeight", { get: scrollHeight });
  const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  scroller.getBoundingClientRect = () => rect(0, geo.clientHeight);
  content.getBoundingClientRect = () => rect(-geo.scrollTop, scrollHeight());
  verse.getBoundingClientRect = () => rect(geo.verseY - geo.scrollTop, 40);

  // every padding the hook writes under the content
  const paddings: string[] = [];
  new MutationObserver(() => paddings.push(content.style.paddingBottom)).observe(content, { attributes: true, attributeFilter: ["style"] });
  return { scroller, content, geo, paddings, verseTop: () => geo.verseY - geo.scrollTop, cleanup: () => (scroller.remove(), style.remove()) };
}

const frames: FrameRequestCallback[] = [];
const flushFrames = async () => {
  await Promise.resolve(); // the MutationObserver's records
  for (let i = 0; i < 5 && frames.length; i++) frames.splice(0).forEach((cb) => cb(performance.now()));
  await Promise.resolve();
};

describe("room under a restored place near the end of the loaded text", () => {
  const saved = { raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame, ro: globalThis.ResizeObserver };
  beforeEach(() => {
    window.requestAnimationFrame = (cb) => (frames.push(cb), frames.length);
    window.cancelAnimationFrame = () => {};
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    window.requestAnimationFrame = saved.raf;
    window.cancelAnimationFrame = saved.caf;
    globalThis.ResizeObserver = saved.ro;
    frames.length = 0;
  });

  // Back to a chapter's last verses: the next chapter is not loaded again yet, so the place is only reachable with room under the text.
  // That room goes in one step once the content alone holds the place. Trimmed bit by bit, a placeholder that grew below and went again
  // before the next chapter was laid out left the page short for a frame, and the verse came back low (a phone, 12-29px).
  it("is added on restore, kept whole while the content grows a little, and dropped in one step when the content holds the place", async () => {
    const c = column();
    const { result } = renderHook(() => useReadingScroll({ scrollerRef: { current: c.scroller }, contentRef: { current: c.content } }));
    expect(result.current.restorePosition({ ref: "Genesis 1:31", offset: 100 })).toBe(true);
    expect(c.verseTop()).toBe(100); // reached at once: 300px of room under 1000px of content
    expect(c.content.style.paddingBottom).toBe("300px");

    // a placeholder below grows (30px, then 60px): the room stays as it is
    for (const h of [1030, 1060]) {
      c.geo.contentHeight = h;
      result.current.check();
      await flushFrames();
      expect(c.content.style.paddingBottom, `content ${h}px`).toBe("300px");
      expect(c.verseTop()).toBe(100);
    }
    // the next chapter arrives: the content alone holds the place, and the room goes, in one step
    c.geo.contentHeight = 1400;
    result.current.check();
    await flushFrames();
    expect(c.content.style.paddingBottom).toBe("");
    expect(c.verseTop()).toBe(100);
    expect(c.paddings.filter((p) => p !== "" && p !== "300px"), "no room size in between").toEqual([]);
    c.cleanup();
  });
});
