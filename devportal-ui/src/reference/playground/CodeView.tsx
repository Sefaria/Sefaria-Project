// Read-only code with line numbers (and, for responses, folding), tokenized by CodeMirror 5 runMode
// (code/highlight.ts) and rendered as our own elements. Every character reaches the DOM as a text node.
import { useEffect, useMemo, useState } from 'react';
import { foldRanges } from '../code/fold';
import { highlight, tokenClass, type TokenLine } from '../code/highlight';
import styles from './CodeView.module.css';

function Line({ tokens }: { tokens: TokenLine }) {
  return (
    <>
      {tokens.length === 0
        ? '​'
        : tokens.map((token, i) => {
            const className = tokenClass(token.style);
            return className === undefined ? (
              token.text
            ) : (
              <span key={i} className={className}>
                {token.text}
              </span>
            );
          })}
    </>
  );
}

/** The request sample (material-palenight). */
export function CodeView({ code, mode, label }: { code: string; mode: string | object | null; label: string }) {
  // The pixel harness maps live's `.CodeMirror-line` to the first line of each viewer.
  const lines = useMemo(() => highlight(code, mode), [code, mode]);
  return (
    <pre className={`${styles.code} ${styles.palenight} dp-cm-palenight`} aria-label={label}>
      <code className={styles.lines}>
        {lines.map((tokens, i) => (
          <span key={i} className={styles.row}>
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.text} data-visual={i === 0 ? 'codeLine' : undefined}>
              <span className={styles.content}>
                <Line tokens={tokens} />
              </span>
              {'\n'}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}

/**
 * Rows of the response viewer rendered before the reader scrolls it: more than the tallest viewer shows
 * (`max-height: calc(100vh - 215px)` at 17.25px a row). Some examples run to thousands of lines (get-counts); the
 * prerendered page and the first client render carry these rows only, and the rest render right after mount (or
 * on the first scroll, hover or focus, if sooner), so the whole text is in the DOM for find-in-page, selection and
 * assistive technology. A spacer keeps the scroll height of the whole text meanwhile.
 */
export const RESPONSE_ROWS_FIRST = 80;
const RESPONSE_ROW_HEIGHT = 17.25;

/** The response viewer (neo), with line numbers and fold markers. */
export function ResponseViewer({ text, mode, label }: { text: string; mode: string | object | null; label: string }) {
  const lines = useMemo(() => highlight(text, mode), [text, mode]);
  const ranges = useMemo(() => foldRanges(text), [text]);
  const [folded, setFolded] = useState<Set<number>>(() => new Set());
  const [complete, setComplete] = useState(false);
  const rows: { index: number; tokens: TokenLine; foldedTo: number | null }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const end = ranges.get(i);
    if (end !== undefined && folded.has(i)) {
      rows.push({ index: i, tokens: lines[i] ?? [], foldedTo: end });
      i = end;
    } else {
      rows.push({ index: i, tokens: lines[i] ?? [], foldedTo: null });
    }
  }
  const shown = complete ? rows : rows.slice(0, RESPONSE_ROWS_FIRST);
  const hidden = rows.length - shown.length;
  const completeNow = hidden > 0 ? () => setComplete(true) : undefined;
  useEffect(() => {
    if (complete || hidden === 0) return undefined;
    const id = window.setTimeout(() => setComplete(true), 0);
    return () => window.clearTimeout(id);
  }, [complete, hidden]);
  const toggle = (line: number) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  return (
    <pre
      className={`${styles.code} ${styles.neo} dp-cm-neo`}
      aria-label={label}
      onScroll={completeNow}
      onPointerEnter={completeNow}
      onFocus={completeNow}
    >
      <code className={styles.lines}>
        {shown.map(({ index, tokens, foldedTo }) => {
          const foldable = ranges.has(index);
          return (
            <span key={index} className={styles.row}>
              <span className={styles.number} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.foldGutter}>
                {foldable ? (
                  <button
                    type="button"
                    className={styles.foldButton}
                    aria-expanded={foldedTo === null}
                    aria-label={`${foldedTo === null ? 'Fold' : 'Unfold'} lines ${index + 1} to ${(ranges.get(index) ?? index) + 1}`}
                    onClick={() => toggle(index)}
                  >
                    {foldedTo === null ? '▾' : '▸'}
                  </button>
                ) : null}
              </span>
              <span className={styles.text} data-visual={index === 0 ? 'respCode' : undefined}>
                <span className={styles.content}>
                  <Line tokens={tokens} />
                  {foldedTo !== null ? (
                    <>
                      <span className={styles.foldMarker}>↔</span>
                      <Line tokens={lines[foldedTo] ?? []} />
                    </>
                  ) : null}
                </span>
                {'\n'}
              </span>
            </span>
          );
        })}
        {hidden > 0 ? (
          // An SVG's height attribute, not a style: the prerendered markup is under a CSP without 'unsafe-inline'.
          <svg
            className={styles.spacer}
            width="1"
            height={Math.round(hidden * RESPONSE_ROW_HEIGHT)}
            aria-hidden="true"
            focusable="false"
          />
        ) : null}
      </code>
    </pre>
  );
}
