import { Bug } from 'lucide-react';
import styles from './KnownIssuesNotice.module.css';

/** Deliberately soft: a yellow-100 fill, never the feedback-warning yellow. */
export function KnownIssuesNotice() {
  return (
    <div role="note" className={styles.root}>
      <Bug size={18} strokeWidth={2} className={styles.icon} aria-hidden="true" />
      <p className={styles.text}>
        <strong>This project may no longer be active.</strong> Things may not work as expected.
      </p>
    </div>
  );
}
