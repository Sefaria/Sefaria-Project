import { afterEach, describe, expect, it } from "vitest";
import { placeSegment, scrollSegmentToLine } from "./dom-position";

function setup() {
  const root = document.createElement("section");
  root.innerHTML = `<div data-reader-scroller style="overflow-y:auto"><div role="group" data-ref="Genesis 1:2">x</div></div>`;
  document.body.append(root);
  const scroller = root.querySelector<HTMLElement>("[data-reader-scroller]")!;
  const seg = root.querySelector<HTMLElement>('[data-ref="Genesis 1:2"]')!;
  scroller.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  // the segment moves up as the column scrolls
  seg.getBoundingClientRect = () => ({ top: 600 - scroller.scrollTop }) as DOMRect;
  return { root, scroller };
}

afterEach(() => document.body.replaceChildren());

describe("placeSegment", () => {
  it("scrolls the column so the segment sits at the offset from its top", () => {
    const { root, scroller } = setup();
    expect(placeSegment(root, { ref: "Genesis 1:2", offset: 40 })).toBe(true);
    expect(scroller.scrollTop).toBe(460);
  });

  it("is false when the segment is not loaded", () => {
    const { root } = setup();
    expect(placeSegment(root, { ref: "Genesis 9:9", offset: 0 })).toBe(false);
  });

  it("brings a segment to the reading line", () => {
    const { root, scroller } = setup();
    expect(scrollSegmentToLine(root, "Genesis 1:2")).toBe(true);
    expect(scroller.scrollTop).toBeGreaterThan(300);
  });
});
