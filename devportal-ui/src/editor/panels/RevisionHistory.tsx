// Revision history with restore (PLAN §2.11): restoring copies a revision into a new draft; history is never
// rewritten.
import type { RevisionSummary } from '../../contracts';
import styles from './Panels.module.css';

export interface RevisionHistoryProps {
  revisions: readonly RevisionSummary[] | null;
  busy: boolean;
  onRestore(number: number): void;
}

const SOURCES: Record<string, string> = { import: 'Imported', editor: 'Edited', restore: 'Restored' };

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function RevisionHistory({ revisions, busy, onRestore }: RevisionHistoryProps) {
  return (
    <section className={styles.panel} aria-labelledby="dp-history-title">
      <h2 id="dp-history-title">Revision history</h2>
      {revisions === null ? (
        <p className={styles.hint}>Loading…</p>
      ) : (
        <ol className={styles.revisions} reversed>
          {revisions.map((r) => (
            <li key={r.number}>
              <div>
                <strong>Revision {r.number}</strong>
                {r.isPublished && <span className={styles.badge}>Published</span>}
                {r.isDraft && <span className={styles.badge}>Draft</span>}
              </div>
              <div className={styles.hint}>
                {SOURCES[r.source] ?? r.source} {r.author ? `by ${r.author.name}` : ''} ·{' '}
                <time dateTime={r.createdAt}>{when(r.createdAt)}</time>
              </div>
              <div className={styles.hint}>{r.title}</div>
              {!r.isDraft && (
                <button type="button" disabled={busy} onClick={() => onRestore(r.number)}>
                  Restore revision {r.number} as a new draft
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
