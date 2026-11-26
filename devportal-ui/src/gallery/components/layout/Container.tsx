import type { ReactNode } from 'react';
import { cx } from '../ui/cx';
import styles from './Container.module.css';

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.root, className)}>{children}</div>;
}
