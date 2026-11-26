import type { ReactNode } from 'react';
import { Braces } from 'lucide-react';
import { cx } from './cx';
import styles from './Tag.module.css';

export type TagVariant = 'category' | 'topic' | 'resource';
export type TagSize = 'xs' | 'sm' | 'md'; // 24 / 28 / 32 px

interface TagProps {
  variant: TagVariant;
  size?: TagSize;
  /** Leading icon (category tags). Resource tags always show braces. */
  icon?: ReactNode;
  children: ReactNode;
}

/** Non-interactive label. Four tag types, four shapes (the fourth, "built with", is plain text). */
export function Tag({ variant, size = 'md', icon, children }: TagProps) {
  return (
    <span className={cx(styles.tag, styles[variant], styles[size])}>
      {variant === 'resource' ? <Braces size={14} strokeWidth={2} aria-hidden="true" /> : icon}
      {children}
    </span>
  );
}
