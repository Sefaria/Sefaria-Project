import { beforeEach, describe, expect, it } from "vitest";
import { segmentsInRange, selectedText } from "./selection";

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = `<div id="root">
    <div role="group" data-ref="Genesis 1:1"><span aria-hidden="true">1</span><span data-no-select>3 connections available</span>
      <p><span lang="he">בְּרֵאשִׁ֖ית<sup data-note="0">a</sup> בָּרָ֣א אֱלֹהִ֑ים</span><span role="note">hidden footnote text</span></p></div>
    <div role="group" data-ref="Genesis 1:2"><span aria-hidden="true">2</span><p><span lang="he">וְהָאָ֗רֶץ הָיְתָ֥ה</span></p></div>
  </div>`;
  root = document.getElementById("root")!;
});

const rangeAround = (from: Node, to: Node) => {
  const r = document.createRange();
  r.setStartBefore(from);
  r.setEndAfter(to);
  return r;
};

// @feature TXD-057 @feature TXD-059
describe("reading a selection", () => {
  it("yields the words only: no numbers, link-dot text, footnote markers or footnote bodies", () => {
    const first = root.querySelector('[data-ref="Genesis 1:1"]')!;
    expect(selectedText(rangeAround(first, first))).toBe("בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים");
  });
  it("collapses whitespace and trims", () => {
    document.body.innerHTML = '<p id="p">  one \n\t two  </p>';
    const p = document.getElementById("p")!;
    expect(selectedText(rangeAround(p.firstChild!, p.firstChild!))).toBe("one two");
  });
  it("finds the segments a selection touches", () => {
    const [a, b] = [...root.querySelectorAll('[role="group"]')];
    expect(segmentsInRange(root, rangeAround(a!, a!))).toEqual(["Genesis 1:1"]);
    expect(segmentsInRange(root, rangeAround(a!, b!))).toEqual(["Genesis 1:1", "Genesis 1:2"]);
    const word = a!.querySelector('[lang="he"]')!.firstChild!;
    const r = document.createRange();
    r.setStart(word, 0);
    r.setEnd(word, 3);
    expect(segmentsInRange(root, r)).toEqual(["Genesis 1:1"]); // a part of one segment
  });
});
