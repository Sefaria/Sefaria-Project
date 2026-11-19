import { useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { CLEARED_VALUES, filterFacets, filterProjects, type Filters } from '../../lib/filter';
import type { Project } from '../../lib/project';
import { formatNumber, pluralize } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { IconButton } from '../../components/ui/IconButton';
import { FilterPanel } from './FilterPanel';
import styles from './FilterSheet.module.css';

interface FilterSheetProps {
  projects: readonly Project[];
  filters: Filters;
  /** Everything the sheet controls: the filters, the display option and (via Clear all) the search. */
  onApply: (next: Filters) => void;
  onClose: () => void;
}

/**
 * A bottom sheet. The selection is held here and only applied on "Show";
 * closing any other way discards it. Mount to open, unmount to close.
 */
export function FilterSheet({ projects, filters, onApply, onClose }: FilterSheetProps) {
  const titleId = useId();
  const [pending, setPending] = useState<Filters>(filters);

  const facets = useMemo(() => filterFacets(projects, pending), [projects, pending]);
  const matching = useMemo(() => filterProjects(projects, pending).length, [projects, pending]);

  return (
    <Dialog placement="sheet" labelledBy={titleId} onClose={onClose}>
      <div className={styles.handle} aria-hidden="true" />
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          Filters
        </h2>
        <IconButton filled aria-label="Close" onClick={onClose}>
          <X size={24} strokeWidth={2} aria-hidden="true" />
        </IconButton>
      </div>
      <div className={styles.body}>
        <FilterPanel
          large
          facets={facets}
          filters={pending}
          onChange={(patch) => setPending((current) => ({ ...current, ...patch }))}
        />
      </div>
      <div className={styles.footer}>
        <Button variant="text" onClick={() => setPending((current) => ({ ...current, ...CLEARED_VALUES, q: '' }))}>
          Clear all
        </Button>
        <Button
          variant="primary"
          size="lg"
          className={styles.show}
          onClick={() => {
            onApply({
              q: pending.q,
              category: pending.category,
              topics: pending.topics,
              languages: pending.languages,
              resources: pending.resources,
              tech: pending.tech,
              showBuggy: pending.showBuggy,
            });
            onClose();
          }}
        >
          Show {formatNumber(matching)} {pluralize(matching, 'project')}
        </Button>
      </div>
    </Dialog>
  );
}
