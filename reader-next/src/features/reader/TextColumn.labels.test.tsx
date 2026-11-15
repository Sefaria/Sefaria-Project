import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { labelSwitchCorrection, useReaderActed } from "./TextColumn";

// When the labels change language the column puts the verse that was on the focus line back where it was, but only for a switch the
// reader's own scrolling brought. Labels settling as the column comes back (Back to a Hebrew text on a phone, with the live site's
// timing) were measured while the menu's site header was still above the text, and "putting back" that verse moved the reader 60px.
describe("the label switch correction", () => {
  const column = (top: number) => {
    const scroller = document.createElement("div");
    const verse = document.createElement("div");
    verse.setAttribute("role", "group");
    verse.dataset.ref = "Genesis 1:28";
    verse.getBoundingClientRect = () => ({ top, bottom: top + 40, height: 40, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    scroller.append(verse);
    return scroller;
  };

  it("does nothing before the reader has scrolled, pressed a key or touched the page", () => {
    expect(labelSwitchCorrection({ ref: "Genesis 1:28", top: -69.6 }, column(-129.5), false)).toBe(0);
  });
  it("puts the verse back after the reader's own input", () => {
    expect(labelSwitchCorrection({ ref: "Genesis 1:28", top: -69.6 }, column(-129.5), true)).toBeCloseTo(-59.9, 1);
  });
  it("does nothing for a verse that did not move, or is gone", () => {
    expect(labelSwitchCorrection({ ref: "Genesis 1:28", top: 10 }, column(10.2), true)).toBe(0);
    expect(labelSwitchCorrection({ ref: "Genesis 1:29", top: 10 }, column(80), true)).toBe(0);
    expect(labelSwitchCorrection(null, column(80), true)).toBe(0);
  });
});

describe("useReaderActed", () => {
  it("is false until a wheel, touch, key or pointer, then true", () => {
    const { result } = renderHook(() => useReaderActed());
    expect(result.current.current).toBe(false);
    window.dispatchEvent(new WheelEvent("wheel"));
    expect(result.current.current).toBe(true);
    result.current.current = false; // the column resets it when it puts a place back
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(result.current.current).toBe(true);
  });
});
