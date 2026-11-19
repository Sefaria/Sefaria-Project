/**
 * The version-diff page's diff, ported from static/js/diff_page.jsx (DiffStore, DiffRow.generateDiff, DiffCell.acceptChange).
 *
 * A segment's raw text is split into text and HTML tags; the diff runs on the text alone (diff-match-patch, as the old page), and a
 * change may be applied only when it does not cross a tag (the number of tag characters skipped is the same at both ends of it).
 * Each side gets a list of pieces of the same length, so piece i of one side faces piece i of the other:
 *   - [0, text]           the same on both sides;
 *   - [1, text, other]    a change that can be applied: `other` is what the other side has in its place ("" for an insertion);
 *   - [2, text]           a change that touches a tag: shown, but not applicable.
 *
 * diff-match-patch keeps its default one-second limit, as on the old page: with the limit on it also tries a "half match" split first,
 * which changes how equal-cost diffs are cut (Genesis 1:7 in two Masorah editions: off, a different vowel is marked), so turning it off
 * would break parity. The server and the browser then agree unless one of them hits the limit (only very long segments).
 *
 * @feature LEG-010 Text version diff/compare tool (/compare)
 */
import DiffMatchPatch from "diff-match-patch";

export type DiffPiece = [0, string] | [1, string, string] | [2, string];

export interface FilteredText {
  rawText: string;
  /** The text without its tags. */
  filteredText: string;
  /** For each character of the filtered text, how many raw characters (tags) were skipped before it. */
  mapping: number[];
}

/** DiffStore.FilterText: the text without its tags, and where each character was in the raw text. */
export function filterText(rawText: string): FilteredText {
  const mapping: number[] = [];
  const parts: string[] = [];
  let skipped = 0;
  rawText.split(/(<[^>]+>)/).forEach((seg, i) => {
    if (i % 2 === 0) {
      for (let k = 0; k < seg.length; k++) mapping.push(skipped);
      parts.push(seg);
    } else skipped += seg.length;
  });
  return { rawText, filteredText: parts.join(""), mapping };
}

/** DiffStore.ValidateDiff: mark each change applicable (1) or not (2), by whether the tags skipped are constant along it. */
export function validateDiff(f: FilteredText, proposed: Array<[number, string]>): Array<[number, string]> {
  let at = 0;
  return proposed.map(([op, text]) => {
    const len = text.length;
    let out: [number, string];
    if (op === 0) out = [0, text];
    else if (len > 0) out = [f.mapping[at] === f.mapping[at + len - 1] ? 1 : 2, text];
    else out = [f.mapping[at] === f.mapping[at + 1] ? 1 : 2, text];
    at += len;
    return out;
  });
}

let differ: DiffMatchPatch | undefined;
const getDiffer = () => (differ ??= new DiffMatchPatch());

/** DiffRow.generateDiff: the two sides' pieces, aligned. */
export function diffSegments(raw1: string, raw2: string): { v1: DiffPiece[]; v2: DiffPiece[]; f1: FilteredText; f2: FilteredText } {
  const f1 = filterText(raw1);
  const f2 = filterText(raw2);
  let d1: Array<[number, string]> = [];
  let d2: Array<[number, string]> = [];
  let offset = 0;
  for (const [op, text] of getDiffer().diff_main(f1.filteredText, f2.filteredText)) {
    if (op === -1) {
      d1.push([1, text]);
      offset -= 1;
    } else if (op === 1) {
      d2.push([1, text]);
      offset += 1;
    } else {
      if (offset < 0) d2.push([1, ""]);
      else if (offset > 0) d1.push([1, ""]);
      offset = 0;
      d1.push([0, text]);
      d2.push([0, text]);
    }
  }
  if (offset < 0) d2.push([1, ""]);
  else if (offset > 0) d1.push([1, ""]);
  d1 = validateDiff(f1, d1);
  d2 = validateDiff(f2, d2);
  const v1: DiffPiece[] = [];
  const v2: DiffPiece[] = [];
  for (let i = 0; i < Math.max(d1.length, d2.length); i++) {
    const a = d1[i];
    const b = d2[i];
    if (!a || !b) break; // the old page logged "diffs do not match in length"; never seen with diff-match-patch's output
    if (a[0] === 0 && b[0] === 0) {
      v1.push([0, a[1]]);
      v2.push([0, b[1]]);
    } else if (a[0] === 1 && b[0] === 1) {
      v1.push([1, a[1], b[1]]);
      v2.push([1, b[1], a[1]]);
    } else {
      // one side's change crosses a tag: neither is applicable
      v1.push([2, a[1]]);
      v2.push([2, b[1]]);
    }
  }
  return { v1, v2, f1, f2 };
}

/**
 * DiffCell.acceptChange: the segment's whole raw text with piece `index` replaced by `replacement` (tags kept where they were).
 * The old page computed the raw position from the mapping of the piece's first character, which does not exist for an insertion at
 * the very end of the text (it then put the replacement in front of the whole text); here the end maps to the end.
 */
export function applyChange(f: FilteredText, pieces: DiffPiece[], index: number, replacement: string): string {
  let filteredPos = 0;
  for (let i = 0; i < index; i++) filteredPos += pieces[i]![1].length;
  const skipped = filteredPos < f.mapping.length ? f.mapping[filteredPos]! : f.rawText.length - f.filteredText.length;
  const rawPos = filteredPos + skipped;
  return f.rawText.slice(0, rawPos) + replacement + f.rawText.slice(rawPos + pieces[index]![1].length);
}

/** DiffElement's hover message. */
export function changeMessage(text: string, toText: string): string {
  if (!text) return "Click to add `" + toText + "`";
  if (!toText) return "Click to remove `" + text + "`";
  return "Click to change `" + text + "` to `" + toText + "`";
}

/** The old page's filter checkboxes (compare.html #filters): a change whose whole text is one of these can be hidden. */
export const DIFF_FILTERS: ReadonlyArray<{ value: string; id?: string }> = [
  { value: "י", id: "yud" },
  { value: "ו", id: "vav" },
  { value: '"' },
  { value: ":" },
  { value: "'" },
  { value: "(" },
  { value: ")" },
];
