import type { ReactNode } from 'react';
import { cx } from './cx';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group, e.g. "Show projects as". */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A group of toggle buttons where exactly one is pressed. Text labels appear from 1024px. */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          aria-label={option.label}
          className={cx(styles.button, option.value === value && styles.pressed)}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span className={styles.text} aria-hidden="true">
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}
