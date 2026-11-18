import { splitLines } from './highlight';

/**
 * Fold ranges of pretty-printed JSON: a line ending in `{` or `[` opens a range that the line starting with the
 * matching `}` or `]` closes. Returns start line → end line (0-based).
 */
export function foldRanges(text: string): Map<number, number> {
  const ranges = new Map<number, number>();
  const stack: number[] = [];
  splitLines(text).forEach((line, i) => {
    const trimmed = line.trim();
    if (/^[}\]]/.test(trimmed)) {
      const start = stack.pop();
      if (start !== undefined && i - start > 1) ranges.set(start, i);
    }
    if (/[{[]$/.test(trimmed)) stack.push(i);
  });
  return ranges;
}
