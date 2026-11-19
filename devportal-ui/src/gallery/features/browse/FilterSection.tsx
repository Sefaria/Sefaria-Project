import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../components/ui/cx';
import styles from './FilterSection.module.css';

interface FilterSectionProps {
  title: string;
  /** Number of selected values, shown in the header: "Topics · 2". */
  selected?: number;
  /** Always-open sections have no disclosure button, only a visible legend. */
  alwaysOpen?: boolean;
  defaultOpen?: boolean;
  /** Receives the class for the group's `<legend>`: visible when always open, otherwise hidden. */
  children: (legendClassName: string) => ReactNode;
}

/** One section of the filter panel. A disclosure unless `alwaysOpen`. */
export function FilterSection({ title, selected = 0, alwaysOpen, defaultOpen, children }: FilterSectionProps) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen ?? selected > 0);

  if (alwaysOpen) return <div className={styles.section}>{children(styles.legend ?? '')}</div>;

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected > 0 ? `${title} · ${selected}` : title}</span>
        <ChevronDown size={18} strokeWidth={2} aria-hidden="true" className={cx(styles.chevron, open && styles.open)} />
      </button>
      <div id={bodyId} hidden={!open}>
        {children(styles.legendHidden ?? '')}
      </div>
    </div>
  );
}
