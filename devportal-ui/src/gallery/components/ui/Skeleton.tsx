import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  className?: string;
}

/** A decorative loading placeholder. */
export function Skeleton({ width, height, className }: SkeletonProps) {
  return <span aria-hidden="true" className={cx(styles.root, className)} style={{ width, height }} />;
}
