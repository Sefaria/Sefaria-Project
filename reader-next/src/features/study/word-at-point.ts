import { wordsIn } from "~/lib/study/words";

/** The word under a viewport point, and where it sits on screen, if the point is over text. */
export function wordAtPoint(x: number, y: number): { word: string; rect: DOMRect } | undefined {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | undefined;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) ({ offsetNode: node, offset } = p);
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) ({ startContainer: node, startOffset: offset } = r);
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return undefined;
  const w = wordsIn((node as Text).data).find((w) => offset >= w.start && offset <= w.end);
  if (!w) return undefined;
  const range = document.createRange();
  range.setStart(node, w.start);
  range.setEnd(node, w.end);
  return { word: w.word, rect: range.getBoundingClientRect() };
}
