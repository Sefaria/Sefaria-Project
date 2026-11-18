import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx';
import styles from './IconButton.module.css';

interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'aria-label'> {
  /** Required: icon-only buttons need an accessible name. */
  'aria-label': string;
  children: ReactNode;
  /** Filled with the hover surface (dialog close, menu). */
  filled?: boolean;
}

export function IconButton({ filled, className, type = 'button', ...rest }: IconButtonProps) {
  return <button type={type} className={cx(styles.root, filled && styles.filled, className)} {...rest} />;
}
