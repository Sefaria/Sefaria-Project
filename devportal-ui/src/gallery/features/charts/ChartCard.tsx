import type { ReactNode } from 'react';
import { DataTable, type DataTableProps } from './DataTable';
import styles from './ChartCard.module.css';

export interface LegendItem {
  label: string;
  color: string;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Content right-aligned in the header, e.g. the all-time total. */
  headerRight?: ReactNode;
  /** Shown above the chart when there are two or more series. */
  legend?: readonly LegendItem[];
  footnote?: ReactNode;
  table: DataTableProps;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, headerRight, legend, footnote, table, children }: ChartCardProps) {
  return (
    <section className={styles.card} aria-label={title}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        {headerRight}
      </header>
      {legend && legend.length >= 2 && (
        <ul className={styles.legend} aria-label="Legend">
          {legend.map((item) => (
            <li key={item.label} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.chart}>{children}</div>
      {footnote && <div className={styles.footnote}>{footnote}</div>}
      <details className={styles.details}>
        <summary className={styles.summary}>Show as table</summary>
        <DataTable {...table} />
      </details>
    </section>
  );
}
