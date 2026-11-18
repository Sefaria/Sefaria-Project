import styles from './DataTable.module.css';

export interface DataTableProps {
  caption: string;
  columns: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<string | number>>;
}

/** The accessible alternative to every chart: the same numbers as a plain table. */
export function DataTable({ caption, columns, rows }: DataTableProps) {
  return (
    // A scrollable region must be keyboard-focusable (axe: scrollable-region-focusable).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className={styles.scroller} tabIndex={0} role="region" aria-label={`${caption} table`}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={j}>{cell}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
