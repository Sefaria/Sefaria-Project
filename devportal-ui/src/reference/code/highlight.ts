// Read-only code display (PLAN §2.12): CodeMirror 5's runMode add-on tokenizes; our own components render the
// tokens with `dp-cm-*` classes, styled by code.css (the material-palenight and neo colors as live shows them).
// No editor is created and no styles are injected.
//
// In the browser bundle `codemirror` is the full library, which runMode needs. Under Node (prerender, Vitest in the
// node environment) the CodeMirror library cannot load (it touches `document`), so the caller first loads
// `codemirror/addon/runmode/runmode.node.js`, which registers itself as `codemirror` in Node's module cache; see
// scripts/prerender-endpoints.ts and src/reference/code/node-runmode.ts.
import CodeMirror from 'codemirror';
import 'codemirror/addon/runmode/runmode.js';
import 'codemirror/mode/shell/shell.js';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/ruby/ruby.js';
import 'codemirror/mode/php/php.js';
import 'codemirror/mode/python/python.js';
import 'codemirror/mode/clike/clike.js';
import 'codemirror/mode/clojure/clojure.js';
import 'codemirror/mode/crystal/crystal.js';
import 'codemirror/mode/go/go.js';
import 'codemirror/mode/http/http.js';
import 'codemirror/mode/mllike/mllike.js';
import 'codemirror/mode/powershell/powershell.js';
import 'codemirror/mode/r/r.js';
import 'codemirror/mode/rust/rust.js';
import 'codemirror/mode/swift/swift.js';

/** One token of a line: its text and, when the mode styled it, the space-separated CodeMirror styles. */
export interface Token {
  text: string;
  style: string | null;
}

export type TokenLine = Token[];

interface RunModeCodeMirror {
  runMode: (
    text: string,
    mode: string | object,
    callback: (text: string, style: string | null | undefined) => void
  ) => void;
}

/** Splits like CodeMirror (`\r\n`, `\r`, `\n`), so a sample shows the lines CodeMirror would show. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n?|\n/);
}

/** Tokenizes `text` with the CodeMirror 5 mode `mode` (a mode name or MIME type); `null` means plain text. */
export function highlight(text: string, mode: string | object | null): TokenLine[] {
  let line: TokenLine = [];
  const lines: TokenLine[] = [line];
  const push = (chunk: string, style: string | null) => {
    if (chunk === '') return;
    const last = line[line.length - 1];
    if (last !== undefined && last.style === style) last.text += chunk;
    else line.push({ text: chunk, style });
  };
  if (mode === null) {
    return splitLines(text).map((line) => (line === '' ? [] : [{ text: line, style: null }]));
  }
  (CodeMirror as unknown as RunModeCodeMirror).runMode(text, mode, (chunk, style) => {
    if (chunk === '\n') {
      line = [];
      lines.push(line);
      return;
    }
    push(chunk, style ?? null);
  });
  return lines;
}

/** `dp-cm-` classes for a CodeMirror style string ("variable-2 strong" → "dp-cm-variable-2 dp-cm-strong"). */
export function tokenClass(style: string | null): string | undefined {
  if (style === null || style === '') return undefined;
  return style
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => `dp-cm-${s}`)
    .join(' ');
}
