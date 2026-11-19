// Whitespace of fenced code, as live shows it. The renderer keeps a fence's content byte for byte, so a
// fence whose last lines are blank ends with "\n\n"; live drops those blank lines (its code element
// ends with a single newline), which matters for the block's height. This trims them in place.
import type { Cleanup } from './types';

/** Collapses trailing blank lines of a code element's text to the single final newline. */
export function trimTrailingBlankLines(code: HTMLElement): boolean {
  const last = code.lastChild;
  if (!last || last.nodeType !== Node.TEXT_NODE) return false;
  const text = last.textContent ?? '';
  const trimmed = text.replace(/\n(?:[ \t]*\n)+$/, '\n');
  if (trimmed === text) return false;
  last.textContent = trimmed;
  return true;
}

export function enhanceCodeBlocks(root: ParentNode): Cleanup {
  for (const code of root.querySelectorAll<HTMLElement>('pre > code')) trimTrailingBlankLines(code);
  return () => {};
}
