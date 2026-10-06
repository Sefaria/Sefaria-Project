import { isText } from "domhandler";
import { escapeText } from "entities";
import {
  isElement,
  parseHtml,
  serializeCloseTag,
  serializeOpenTag,
} from "./html.js";
import { normalizeText } from "./normalize.js";

/** Sanitized, bounded text with an explicit truncation indicator. */
export interface TextPreview {
  /** Balanced safe HTML for rendering. */
  readonly html: string;
  /** Decoded text, including newline separators, for accessibility and counting. */
  readonly text: string;
  /** Whether visible input remains beyond the requested bound. */
  readonly truncated: boolean;
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; name: string; html: string }
  | { kind: "close"; name: string }
  | { kind: "break" };

/**
 * Accepts raw HTML, normalizes it, and bounds rendered graphemes across inline node boundaries.
 * Footnotes, annotations, and link interaction are omitted from this compact view.
 */
export function createTextPreview(
  input: string,
  maximumGraphemes = 3500,
): TextPreview {
  if (!Number.isSafeInteger(maximumGraphemes) || maximumGraphemes < 1) {
    throw new RangeError("Preview bound must be a positive safe integer.");
  }
  const safe = normalizeText(input, {
    allowFootnotes: false,
    allowInlineAnnotations: false,
    allowNamedEntities: false,
    allowRefLinks: false,
  }).bodyHtml;
  const tokens: Token[] = [];
  const text: string[] = [];
  type Task =
    { nodes: ReturnType<typeof parseHtml>; index: number } | { close: string };
  const tasks: Task[] = [{ nodes: parseHtml(safe), index: 0 }];
  while (tasks.length > 0) {
    const task = tasks.pop();
    if (!task) break;
    if ("close" in task) {
      tokens.push({ kind: "close", name: task.close });
      continue;
    }
    const node = task.nodes[task.index];
    if (!node) continue;
    tasks.push({ nodes: task.nodes, index: task.index + 1 });
    if (isText(node)) {
      tokens.push({ kind: "text", value: node.data });
      text.push(node.data);
    } else if (isElement(node)) {
      if (node.name === "br") {
        tokens.push({ kind: "break" });
        text.push("\n");
      } else {
        tokens.push({
          kind: "open",
          name: node.name,
          html: serializeOpenTag(node.name, node.attribs),
        });
        tasks.push({ close: node.name }, { nodes: node.children, index: 0 });
      }
    }
  }
  const plain = text.join("");
  let cutoff = plain.length;
  let count = 0;
  for (const segment of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(plain)) {
    if (count++ === maximumGraphemes) {
      cutoff = segment.index;
      break;
    }
  }
  const output: string[] = [];
  const opened: boolean[] = [];
  let position = 0;
  for (const token of tokens) {
    if (token.kind === "open") {
      const include = position < cutoff;
      opened.push(include);
      if (include) output.push(token.html);
    } else if (token.kind === "close") {
      if (opened.pop()) output.push(serializeCloseTag(token.name));
    } else if (token.kind === "break") {
      if (position < cutoff) output.push("<br>");
      position++;
    } else {
      if (position < cutoff)
        output.push(escapeText(token.value.slice(0, cutoff - position)));
      position += token.value.length;
    }
  }
  return {
    html: output.join(""),
    text: plain.slice(0, cutoff),
    truncated: cutoff < plain.length,
  };
}
