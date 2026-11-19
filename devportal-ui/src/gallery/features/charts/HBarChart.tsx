import { formatNumber } from '../../lib/format';
import { cx } from '../../components/ui/cx';
import styles from './HBarChart.module.css';

export interface HBarRow {
  label: string;
  value: number;
}

/** Horizontal bars as plain markup: labels and values are real text, not hover-only. */
export function HBarChart({ rows, ariaLabel }: { rows: readonly HBarRow[]; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={styles.list} aria-label={ariaLabel}>
      {rows.map((row) => (
        <li key={row.label} className={styles.row}>
          <span className={styles.label}>{row.label}</span>
          <span className={styles.track}>
            <span className={styles.area}>
              <span
                className={cx(styles.bar, row.value === 0 && styles.zero)}
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </span>
            <span className={styles.value}>{formatNumber(row.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
