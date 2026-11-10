import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLastTextSelection } from "./use-last-selection";

afterEach(() => {
  document.body.innerHTML = "";
});

const select = (from: Node, fromOffset: number, to: Node, toOffset: number) => {
  const r = document.createRange();
  r.setStart(from, fromOffset);
  r.setEnd(to, toOffset);
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
  document.dispatchEvent(new Event("selectionchange"));
};

// @feature CON-056 The words last selected in the text, kept for Add to Sheet (old ReaderPanel.selectedWords)
describe("useLastTextSelection", () => {
  it("keeps the words and verses selected in the column after the selection collapses; ignores selections elsewhere", () => {
    document.body.innerHTML = `<div data-reader-scroller><div role="group" data-ref="Genesis 1:1"><span aria-hidden="true">1</span><p>In the beginning</p></div><div role="group" data-ref="Genesis 1:2"><p>Now the earth</p></div></div><aside><p id="side">Elsewhere</p></aside>`;
    const { result } = renderHook(() => useLastTextSelection());
    const [a, b] = [...document.querySelectorAll("p")].map((p) => p.firstChild!);
    act(() => select(a!, 7, b!, 7));
    expect(result.current).toEqual({ words: "beginning Now the", refs: ["Genesis 1:1", "Genesis 1:2"] });
    act(() => {
      document.getSelection()!.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(result.current?.words).toBe("beginning Now the");
    const side = document.getElementById("side")!.firstChild!;
    act(() => select(side, 0, side, 5));
    expect(result.current?.words).toBe("beginning Now the");
  });
});
