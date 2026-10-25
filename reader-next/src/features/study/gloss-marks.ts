import { glossKey, wordsIn } from "~/lib/study/glossary";

const SKIP = "a, sup, mark[data-gloss], [data-note], script, style";

/** Underline every word of `root`'s segments whose gloss key is in `keys`, and lift marks for words no longer there. */
export function paintGlossMarks(root: HTMLElement, keys: ReadonlySet<string>) {
  for (const mark of root.querySelectorAll<HTMLElement>("mark[data-gloss]")) {
    if (keys.has(mark.dataset.gloss!)) continue;
    const parent = mark.parentNode!;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  }
  if (!keys.size) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('[role="group"][data-ref]') && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.data;
    const hits = wordsIn(text).filter((w) => keys.has(glossKey(w.word)));
    if (!hits.length) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const h of hits) {
      if (h.start > at) frag.append(text.slice(at, h.start));
      const mark = document.createElement("mark");
      mark.dataset.gloss = glossKey(h.word);
      mark.textContent = h.word;
      frag.append(mark);
      at = h.end;
    }
    if (at < text.length) frag.append(text.slice(at));
    node.replaceWith(frag);
  }
}

/** The word under a viewport point, if the point is over text. */
export function wordAtPoint(x: number, y: number): string | undefined {
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
  return w && glossKey(w.word) ? w.word : undefined;
}
