import { useEffect, useState } from "react";
import { segmentsInRange } from "~/lib/reader/selection";

export interface TextSelection {
  words: string;
  /** The segments the selection touched, in order. */
  refs: string[];
}

/** Things inside a segment that are not its text (as lib/reader/selection.ts). */
const NOT_TEXT = '[data-no-select], [aria-hidden="true"], [role="note"], sup[data-note]';

/** The selected words, a space between verses (textContent runs the verses' paragraphs together). */
function wordsOf(range: Range): string {
  const fragment = range.cloneContents();
  fragment.querySelectorAll(NOT_TEXT).forEach((n) => n.remove());
  fragment.querySelectorAll('[role="group"], p, br').forEach((n) => n.after(" "));
  return (fragment.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The last words the reader selected in the text column (the old ReaderPanel.selectedWords): kept after the selection collapses (a
 * click on Add to Sheet collapses it), replaced by the next selection. Users of it check `refs` against the verses they act on.
 */
export function useLastTextSelection(): TextSelection | null {
  const [last, setLast] = useState<TextSelection | null>(null);
  useEffect(() => {
    const onChange = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = node instanceof Element ? node : node.parentElement;
      const scroller = el?.closest("[data-reader-scroller]");
      if (!scroller) return;
      const words = wordsOf(range);
      if (!words) return;
      const refs = segmentsInRange(scroller, range);
      setLast((prev) => (prev && prev.words === words && prev.refs.join("|") === refs.join("|") ? prev : { words, refs }));
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);
  return last;
}
