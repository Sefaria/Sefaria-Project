import { useId } from 'react';
import styles from './Switch.module.css';

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Taller 52px row, for the mobile sheet. */
  large?: boolean;
}

/** A real checkbox with role="switch"; the whole row is the hit area, the track is drawn. */
export function Switch({ label, checked, onChange, large }: SwitchProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={large ? `${styles.row} ${styles.large}` : styles.row}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.label}>{label}</span>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </label>
  );
}
