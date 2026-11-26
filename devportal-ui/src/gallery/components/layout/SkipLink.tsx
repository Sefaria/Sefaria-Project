import type { ReactNode } from 'react';
import styles from './SkipLink.module.css';

/** First focusable element on the page. Moves focus to the target heading without touching the URL. */
export function SkipLink({ targetId, children }: { targetId: string; children: ReactNode }) {
  return (
    <a
      href={`#${targetId}`}
      className={styles.link}
      onClick={(e) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ block: 'start' });
        target.focus();
      }}
    >
      {children}
    </a>
  );
}
