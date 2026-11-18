// Read-only code with line numbers (and, for responses, folding), tokenized by CodeMirror 5 runMode
// (code/highlight.ts) and rendered as our own elements. Every character reaches the DOM as a text node.
import { useMemo, useState } from 'react';
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

/** The response viewer (neo), with line numbers and fold markers. */
export function ResponseViewer({ text, mode, label }: { text: string; mode: string | object | null; label: string }) {
  const lines = useMemo(() => highlight(text, mode), [text, mode]);
  const ranges = useMemo(() => foldRanges(text), [text]);
  const [folded, setFolded] = useState<Set<number>>(() => new Set());
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
  const toggle = (line: number) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  return (
    <pre className={`${styles.code} ${styles.neo} dp-cm-neo`} aria-label={label}>
      <code className={styles.lines}>
        {rows.map(({ index, tokens, foldedTo }) => {
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
      </code>
    </pre>
  );
}
