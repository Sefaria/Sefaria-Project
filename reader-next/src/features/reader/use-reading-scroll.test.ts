import { describe, expect, it } from "vitest";
import { isScrollKey } from "./use-reading-scroll";

// Lane R D3: only keys that scroll mark the reader's intent; copying a selection (Cmd+C), Shift, or extending a selection
// (Shift+arrows) never does, so a later reflow cannot settle on a verse and drop a selected range.
describe("isScrollKey", () => {
  const key = (k: string, o: { shiftKey?: boolean; target?: EventTarget | null } = {}) => ({ key: k, shiftKey: !!o.shiftKey, altKey: false, target: o.target ?? document.body });
  it("counts the keys that scroll", () => {
    for (const k of ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]) expect(isScrollKey(key(k))).toBe(true);
    expect(isScrollKey(key(" ", { shiftKey: true }))).toBe(true); // Shift+Space pages up
  });
  it("does not count modifiers, copying, or extending a selection", () => {
    for (const k of ["Shift", "Meta", "Control", "c", "Escape", "ArrowLeft", "ArrowRight", "Tab"]) expect(isScrollKey(key(k))).toBe(false);
    for (const k of ["ArrowDown", "ArrowUp", "PageDown", "End", "Home"]) expect(isScrollKey(key(k, { shiftKey: true }))).toBe(false);
  });
  it("does not count typing in a field, or Space on a button", () => {
    const input = document.createElement("input");
    const button = document.createElement("button");
    document.body.append(input, button);
    expect(isScrollKey(key("ArrowDown", { target: input }))).toBe(false);
    expect(isScrollKey(key(" ", { target: input }))).toBe(false);
    expect(isScrollKey(key(" ", { target: button }))).toBe(false);
    expect(isScrollKey(key("PageDown", { target: button }))).toBe(true);
  });
});

describe("isScrollKey on a verse", () => {
  it("does not count Space on a verse (it chooses the verse), but counts arrows there", () => {
    const verse = document.createElement("div");
    verse.setAttribute("role", "group");
    verse.dataset.selectable = "true";
    document.body.append(verse);
    expect(isScrollKey({ key: " ", shiftKey: false, altKey: false, target: verse })).toBe(false);
    expect(isScrollKey({ key: "ArrowDown", shiftKey: false, altKey: false, target: verse })).toBe(true);
  });
});
