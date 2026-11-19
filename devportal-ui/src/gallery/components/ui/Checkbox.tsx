import { useId } from 'react';
import { Check } from 'lucide-react';
import styles from './Checkbox.module.css';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A real checkbox whose hit area is the whole 44px row, drawn with our own box. */
export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={styles.row}>
      <input
        id={id}
        type="checkbox"
        className={styles.input}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.box} aria-hidden="true">
        <Check size={14} strokeWidth={3} className={styles.check} />
      </span>
      {label}
    </label>
  );
}
