import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenForSelections } from "./TextColumn";

// Lane R D4: a selection made by keyboard (Shift+arrows) or touch (a long press, then its handles) ends in no mouseup; it is reported
// when `selectionchange` rests, once, exactly as a mouse selection is on mouseup, and never for text outside the column.
describe("listenForSelections", () => {
  let column: HTMLElement;
  let outside: HTMLElement;
  let reports: [string, string[]][];
  let stop: () => void;
  const segment = (ref: string, text: string) => `<div role="group" data-ref="${ref}"><span>${text}</span></div>`;
  const select = (fromRef: string, toRef: string, root = column) => {
    const a = root.querySelector(`[data-ref="${fromRef}"] span`)!.firstChild!;
    const z = root.querySelector(`[data-ref="${toRef}"] span`)!.firstChild!;
    const r = document.createRange();
    r.setStart(a, 0);
    r.setEnd(z, 5);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    document.dispatchEvent(new Event("selectionchange"));
  };
  const pointer = (type: string) => {
    const e = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(e, "pointerType", { value: "mouse" });
    column.dispatchEvent(e);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<main>${segment("Genesis 1:3", "And God said, Let there be light")}${segment("Genesis 1:4", "And God saw the light, that it was good")}${segment("Genesis 1:5", "And God called the light Day")}</main><aside>${segment("Rashi 1", "Some words of a comment here")}${segment("Rashi 2", "More words of a comment here")}</aside>`;
    column = document.querySelector("main")!;
    outside = document.querySelector("aside")!;
    reports = [];
    stop = listenForSelections(() => column, (w, refs) => reports.push([w, refs]), 300);
  });
  afterEach(() => {
    stop();
    document.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  it("reports a keyboard or touch selection once it rests, with the segments it touches", () => {
    select("Genesis 1:3", "Genesis 1:4");
    vi.advanceTimersByTime(100);
    select("Genesis 1:3", "Genesis 1:5"); // the selection grows (Shift+Down again, a handle dragged)
    vi.advanceTimersByTime(299);
    expect(reports).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(reports.map(([, refs]) => refs)).toEqual([["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"]]);
    // the same selection announced again (a late selectionchange) is not reported twice
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(400);
    expect(reports).toHaveLength(1);
  });

  it("reports a mouse selection on mouseup only, not again when its selectionchange arrives", () => {
    pointer("pointerdown");
    select("Genesis 1:3", "Genesis 1:4");
    vi.advanceTimersByTime(1000); // a pause mid-drag reports nothing
    expect(reports).toEqual([]);
    pointer("mouseup");
    expect(reports.map(([, refs]) => refs)).toEqual([["Genesis 1:3", "Genesis 1:4"]]);
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(400);
    expect(reports).toHaveLength(1);
  });

  it("ignores a selection outside the column", () => {
    select("Rashi 1", "Rashi 2", outside);
    vi.advanceTimersByTime(400);
    expect(reports).toEqual([]);
  });

  it("reports the same text again after the selection was cleared", () => {
    select("Genesis 1:3", "Genesis 1:4");
    vi.advanceTimersByTime(300);
    document.getSelection()!.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(300);
    select("Genesis 1:3", "Genesis 1:4");
    vi.advanceTimersByTime(300);
    expect(reports).toHaveLength(2);
  });
});
