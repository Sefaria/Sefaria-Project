import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { VisuallyHidden } from './VisuallyHidden';
import styles from './SearchField.module.css';

interface SearchFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

export function SearchField({ label, placeholder, value, onChange }: SearchFieldProps) {
  const id = useId();
  return (
    <div className={styles.root}>
      <label htmlFor={id}>
        <VisuallyHidden>{label}</VisuallyHidden>
      </label>
      <Search className={styles.icon} size={18} strokeWidth={2} aria-hidden="true" />
      <input
        id={id}
        type="search"
        className={styles.input}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => onChange('')}>
          <X size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
