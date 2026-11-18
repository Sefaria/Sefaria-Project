import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';
import styles from './Select.module.css';

interface SelectProps<T extends string> {
  label: string;
  /** Show the label beside the control from 1024px. It is always available to assistive tech. */
  labelVisibleFromLg?: boolean;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function Select<T extends string>({ label, labelVisibleFromLg, options, value, onChange }: SelectProps<T>) {
  const id = useId();
  return (
    <div className={styles.root}>
      <label htmlFor={id} className={cx(styles.label, labelVisibleFromLg ? styles.responsive : styles.hidden)}>
        {label}
      </label>
      <span className={styles.wrap}>
        <select id={id} className={styles.select} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.chevron} size={18} strokeWidth={2} aria-hidden="true" />
      </span>
    </div>
  );
}
