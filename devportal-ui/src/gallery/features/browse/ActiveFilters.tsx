import { X } from 'lucide-react';
import { CATEGORY_META, type CategoryId } from '../../lib/categories';
import { activeFilterValues, type ActiveValue, type FacetKey, type Filters } from '../../lib/filter';
import { Button } from '../../components/ui/Button';
import { LanguageName } from './LanguageName';
import styles from './ActiveFilters.module.css';

interface ActiveFiltersProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  /** Clears the search as well as every filter value (the page owns the search input). */
  onClearAll: () => void;
}

const PREFIX: Record<FacetKey, string> = {
  topics: '',
  languages: 'Language: ',
  resources: 'Resource: ',
  tech: 'Built with: ',
};

function chipLabel({ key, value }: ActiveValue): string {
  return key === 'category' ? CATEGORY_META[value as CategoryId].label : `${PREFIX[key]}${value}`;
}

/** One removable chip per selected filter value, and a trailing "Clear all". Shown at every breakpoint. */
export function ActiveFilters({ filters, onChange, onClearAll }: ActiveFiltersProps) {
  const values = activeFilterValues(filters);
  if (values.length === 0) return null;

  const remove = ({ key, value }: ActiveValue) =>
    onChange(key === 'category' ? { category: 'all' } : { [key]: filters[key].filter((v) => v !== value) });

  return (
    <ul className={styles.list} aria-label="Active filters">
      {values.map((active) => {
        const label = chipLabel(active);
        return (
          <li key={`${active.key}:${active.value}`}>
            <button
              type="button"
              className={styles.button}
              aria-label={`Remove filter: ${label}`}
              onClick={() => remove(active)}
            >
              <span className={styles.chip}>
                {active.key === 'languages' ? (
                  <>
                    {PREFIX.languages}
                    <LanguageName name={active.value} />
                  </>
                ) : (
                  label
                )}
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </span>
            </button>
          </li>
        );
      })}
      <li>
        <Button variant="text" onClick={onClearAll}>
          Clear all
        </Button>
      </li>
    </ul>
  );
}
