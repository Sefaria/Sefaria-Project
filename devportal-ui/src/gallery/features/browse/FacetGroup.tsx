import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { FacetOption } from '../../lib/filter';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { SearchField } from '../../components/ui/SearchField';
import styles from './FacetGroup.module.css';

const TOP_N = 8;
const SEARCH_THRESHOLD = 12;

interface FacetGroupProps {
  legend: string;
  legendClassName: string;
  options: readonly FacetOption[];
  onToggle: (value: string, checked: boolean) => void;
  /** Adds a "Filter {legend}" box once there are more than 12 options. */
  searchable?: boolean;
  /** Taller 52px rows, for the mobile sheet. */
  large?: boolean;
  /** Custom row label, for values shown differently from how they are stored. */
  renderLabel?: (value: string) => ReactNode;
}

/** A multi-select checkbox group: top 8 options, "Show all n", and optional filtering by text. */
export function FacetGroup({
  legend,
  legendClassName,
  options,
  onToggle,
  searchable,
  large,
  renderLabel,
}: FacetGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');

  const needle = text.trim().toLowerCase();
  const matching = needle ? options.filter((o) => o.value.toLowerCase().includes(needle)) : options;
  // Selected options stay visible even when they fall outside the top 8.
  const shown = expanded || needle ? matching : matching.filter((o, i) => i < TOP_N || o.selected);
  const hiddenByLimit = !expanded && !needle && matching.length > TOP_N;

  return (
    <fieldset className={styles.group}>
      <legend className={legendClassName}>{legend}</legend>
      {searchable && options.length > SEARCH_THRESHOLD && (
        <div className={styles.search}>
          <SearchField
            label={`Filter ${legend.toLowerCase()}`}
            placeholder={`Filter ${legend.toLowerCase()}`}
            value={text}
            onChange={setText}
          />
        </div>
      )}
      {shown.map((option) => (
        <label key={option.value} className={cx(styles.row, large && styles.large, option.selected && styles.selected)}>
          <input
            type="checkbox"
            className={styles.input}
            checked={option.selected}
            onChange={(e) => onToggle(option.value, e.target.checked)}
          />
          <span className={styles.box} aria-hidden="true">
            <Check size={14} strokeWidth={3} className={styles.check} />
          </span>
          <span className={styles.label}>{renderLabel ? renderLabel(option.value) : option.value}</span>{' '}
          <span className={styles.count}>{option.count}</span>
        </label>
      ))}
      {needle && matching.length === 0 && <p className={styles.none}>No matches</p>}
      {hiddenByLimit && (
        <Button variant="text" className={styles.showAll} onClick={() => setExpanded(true)}>
          Show all {matching.length}
        </Button>
      )}
    </fieldset>
  );
}
