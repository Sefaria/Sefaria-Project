import { useId, type CSSProperties } from 'react';
import { ALL_PROJECTS_META, CATEGORIES, CATEGORY_META } from '../../lib/categories';
import type { CategoryFilter, FacetKey, FilterFacets, Filters } from '../../lib/filter';
import { CategoryIcon } from '../../components/icons/CategoryIcon';
import { cx } from '../../components/ui/cx';
import { Switch } from '../../components/ui/Switch';
import { FacetGroup } from './FacetGroup';
import { LanguageName } from './LanguageName';
import { FilterSection } from './FilterSection';
import styles from './FilterPanel.module.css';

interface FilterPanelProps {
  facets: FilterFacets;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  /** Taller 52px rows and every section collapsible, for the mobile sheet. */
  large?: boolean;
}

const ROWS: ReadonlyArray<{ id: CategoryFilter; label: string; color: string }> = [
  { id: 'all', label: ALL_PROJECTS_META.label, color: ALL_PROJECTS_META.colorVar },
  ...CATEGORIES.map((c) => ({
    id: c.id,
    label: CATEGORY_META[c.id].label,
    color: CATEGORY_META[c.id].colorVar,
  })),
];

const FACET_SECTIONS: ReadonlyArray<{
  key: FacetKey;
  title: string;
  searchable?: boolean;
}> = [
  { key: 'topics', title: 'Topics', searchable: true },
  { key: 'languages', title: 'Language' },
  { key: 'resources', title: 'Sefaria resources' },
  { key: 'tech', title: 'Built with' },
];

/**
 * Category, Topics, Language, Sefaria resources, Built with and Display. Used
 * in the sidebar and (with `large`) the sheet. Holds no filter state itself.
 */
export function FilterPanel({ facets, filters, onChange, large }: FilterPanelProps) {
  const name = `${useId()}-category`;
  const alwaysOpen = !large;
  const toggle = (key: FacetKey, value: string, checked: boolean) => {
    const rest = filters[key].filter((v) => v !== value);
    onChange({ [key]: checked ? [...rest, value] : rest });
  };

  return (
    <div className={styles.panel}>
      <FilterSection title="Category" alwaysOpen={alwaysOpen} defaultOpen selected={filters.category !== 'all' ? 1 : 0}>
        {(legendClassName) => (
          <fieldset className={styles.group}>
            <legend className={legendClassName}>Category</legend>
            {ROWS.map(({ id, label, color }) => (
              <label
                key={id}
                className={cx(styles.row, large && styles.large, id === filters.category && styles.selected)}
              >
                <input
                  type="radio"
                  name={name}
                  className={styles.input}
                  checked={id === filters.category}
                  onChange={() => onChange({ category: id })}
                />
                <span className={styles.radio} aria-hidden="true" />
                <span className={styles.icon} style={{ '--icon-color': color } as CSSProperties}>
                  <CategoryIcon id={id} />
                </span>
                <span className={styles.label}>{label}</span>{' '}
                <span className={styles.count}>{facets.category[id]}</span>
              </label>
            ))}
          </fieldset>
        )}
      </FilterSection>

      {FACET_SECTIONS.map(({ key, title, searchable }) => (
        <FilterSection key={key} title={title} selected={filters[key].length}>
          {(legendClassName) => (
            <FacetGroup
              legend={title}
              legendClassName={legendClassName}
              options={facets[key]}
              searchable={searchable}
              large={large}
              renderLabel={key === 'languages' ? (value) => <LanguageName name={value} /> : undefined}
              onToggle={(value, checked) => toggle(key, value, checked)}
            />
          )}
        </FilterSection>
      ))}

      <FilterSection title="Display" alwaysOpen={alwaysOpen} defaultOpen>
        {(legendClassName) => (
          <fieldset className={styles.group}>
            <legend className={legendClassName}>Display</legend>
            <Switch
              label="Show projects with known issues"
              checked={filters.showBuggy}
              large={large}
              onChange={(showBuggy) => onChange({ showBuggy })}
            />
          </fieldset>
        )}
      </FilterSection>
    </div>
  );
}
