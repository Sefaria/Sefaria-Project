/**
 * What the reader selected in the text: the words (without segment numbers, link dots or footnotes) and the
 * segments the selection touches. Old handleTextSelection / getNormalizedSelectionString.
 *
 * @feature TXD-057 Text selection and double-click guard
 * @feature TXD-059 Select words to look up in lexicon
 */
import { normalizeSelection } from "~/lib/lexicon/lookup";

/** Things inside a segment that are not its text. */
const NOT_TEXT = '[data-no-select], [aria-hidden="true"], [role="note"], sup[data-note]';

export function selectedText(range: Range): string {
  const fragment = range.cloneContents();
  fragment.querySelectorAll(NOT_TEXT).forEach((n) => n.remove());
  return normalizeSelection(fragment.textContent ?? "");
}

/** The refs of the segments (within `root`) that the range touches, in document order. */
export function segmentsInRange(root: Element, range: Range): string[] {
  return [...root.querySelectorAll<HTMLElement>('[role="group"][data-ref]')].filter((el) => range.intersectsNode(el)).map((el) => el.dataset.ref!);
}
