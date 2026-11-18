import type { ReactNode } from 'react';
import styles from './VisuallyHidden.module.css';

/** Content for assistive tech only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.root}>{children}</span>;
}
