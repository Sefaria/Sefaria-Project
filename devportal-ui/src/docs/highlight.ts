// Syntax highlighting of `pre > code[data-lang]` with CodeMirror 5's runMode, as live's docs pages do
// (ReadMe's syntax highlighter: CodeMirror 5 modes, theme cm-s-neo). Each token becomes a
// span.dp-tok-<style> (every class in the DOM starts with dp-, contract C5); article.css colours them
// with live's cm-s-neo palette. The server HTML has no highlighting markup (DIALECT.md, Code), and
// CodeMirror is a lazy chunk loaded only when a page has a highlightable block.
import type { Cleanup } from './types';

export type ModeSpec = string | Record<string, unknown>;

/** CodeMirror mode for a fence language, or null for plain text and languages live leaves unhighlighted. */
export function modeFor(lang: string): ModeSpec | null {
  switch (lang.trim().toLowerCase()) {
    case 'python':
    case 'py':
      return 'python';
    case 'javascript':
    case 'js':
    case 'jsx':
    case 'node':
      return 'javascript';
    case 'json':
      return { name: 'javascript', json: true };
    case 'typescript':
    case 'ts':
    case 'tsx':
      return { name: 'javascript', typescript: true };
    case 'bash':
    case 'sh':
    case 'shell':
    case 'zsh':
    case 'curl':
      return 'shell';
    case 'html':
      return 'htmlmixed';
    case 'xml':
    case 'opml':
      return 'xml';
    case 'css':
      return 'css';
    default:
      return null;
  }
}

export interface Tokenizer {
  runMode(text: string, mode: ModeSpec, callback: (text: string, style: string | null | undefined) => void): void;
}

let loading: Promise<Tokenizer> | null = null;

/** Loads CodeMirror's runMode and the modes above, once. */
export function loadTokenizer(): Promise<Tokenizer> {
  loading ??= (async () => {
    const cm = (await import('codemirror')).default;
    await import('codemirror/addon/runmode/runmode.js');
    await Promise.all([
      import('codemirror/mode/python/python.js'),
      import('codemirror/mode/javascript/javascript.js'),
      import('codemirror/mode/shell/shell.js'),
      import('codemirror/mode/xml/xml.js'),
      import('codemirror/mode/css/css.js'),
    ]);
    await import('codemirror/mode/htmlmixed/htmlmixed.js');
    return cm;
  })();
  return loading;
}

/** Token classes for a CodeMirror style string ("string property" → dp-tok-string dp-tok-property). */
export function tokenClasses(style: string): string {
  return style
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => `dp-tok-${s.replace(/[^a-z0-9-]/gi, '').toLowerCase()}`)
    .join(' ');
}

/** Replaces a code element's text with highlighted spans. Returns false when it has no mode. */
export function highlightElement(code: HTMLElement, tokenizer: Tokenizer): boolean {
  const mode = modeFor(code.dataset.lang ?? '');
  if (mode === null || code.classList.contains('dp-highlighted')) return false;
  const text = code.textContent ?? '';
  const fragment = document.createDocumentFragment();
  tokenizer.runMode(text, mode, (token, style) => {
    if (style) {
      const span = document.createElement('span');
      span.className = tokenClasses(style);
      span.textContent = token;
      fragment.appendChild(span);
    } else {
      fragment.appendChild(document.createTextNode(token));
    }
  });
  code.replaceChildren(fragment);
  code.classList.add('dp-highlighted');
  return true;
}

/** Highlights every `pre > code[data-lang]` under root. Resolves when done; the cleanup cancels a pending run. */
export function enhanceHighlighting(
  root: ParentNode,
  load: () => Promise<Tokenizer> = loadTokenizer
): {
  done: Promise<number>;
  cleanup: Cleanup;
} {
  let cancelled = false;
  const blocks = [...root.querySelectorAll<HTMLElement>('pre > code[data-lang]')].filter(
    (c) => modeFor(c.dataset.lang ?? '') !== null
  );
  if (blocks.length === 0) return { done: Promise.resolve(0), cleanup: () => {} };
  const done = load().then(
    (tokenizer) => {
      if (cancelled) return 0;
      return blocks.filter((code) => highlightElement(code, tokenizer)).length;
    },
    () => 0 // Highlighting is cosmetic: the code stays readable as plain text if the chunk fails.
  );
  return {
    done,
    cleanup: () => {
      cancelled = true;
    },
  };
}
