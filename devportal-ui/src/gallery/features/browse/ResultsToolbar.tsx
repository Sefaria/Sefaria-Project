import { LayoutGrid, List, ListFilter } from 'lucide-react';
import { SORT_LABELS, type SortOption } from '../../lib/sort';
import type { ViewMode } from '../../lib/url';
import { Button } from '../../components/ui/Button';
import { SearchField } from '../../components/ui/SearchField';
import { SegmentedControl, type SegmentOption } from '../../components/ui/SegmentedControl';
import { Select } from '../../components/ui/Select';
import styles from './ResultsToolbar.module.css';

interface ResultsToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

const SORT_OPTIONS = (Object.keys(SORT_LABELS) as SortOption[]).map((value) => ({
  value,
  label: SORT_LABELS[value],
}));

const VIEW_OPTIONS: readonly SegmentOption<ViewMode>[] = [
  {
    value: 'grid',
    label: 'Grid',
    icon: <LayoutGrid size={18} strokeWidth={2} aria-hidden="true" />,
  },
  { value: 'list', label: 'List', icon: <List size={18} strokeWidth={2} aria-hidden="true" /> },
];

export function ResultsToolbar(props: ResultsToolbarProps) {
  const { activeFilterCount } = props;
  return (
    <div className={styles.toolbar}>
      <div className={styles.search}>
        <SearchField
          label="Search projects"
          placeholder="Search by name, topic, or description"
          value={props.query}
          onChange={props.onQueryChange}
        />
      </div>
      <div className={styles.controls}>
        <span className={styles.filtersButton}>
          <Button
            variant="outline"
            icon={<ListFilter size={18} strokeWidth={2} aria-hidden="true" />}
            onClick={props.onOpenFilters}
          >
            {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
          </Button>
        </span>
        <Select
          label="Sort"
          labelVisibleFromLg
          options={SORT_OPTIONS}
          value={props.sort}
          onChange={props.onSortChange}
        />
        <SegmentedControl
          label="Show projects as"
          options={VIEW_OPTIONS}
          value={props.view}
          onChange={props.onViewChange}
        />
      </div>
    </div>
  );
}
