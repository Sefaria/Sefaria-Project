import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { searchResultsBucket, track } from '../../lib/analytics';
import { getFeaturedProjects } from '../../lib/featured';
import {
  activeFilterCount,
  CLEARED_VALUES,
  filterFacets,
  filterProjects,
  isVisible,
  FACET_KEYS,
  type Filters,
} from '../../lib/filter';
import { formatNumber } from '../../lib/format';
import { SORT_LABELS, sortProjects } from '../../lib/sort';
import { projectPath } from '../../lib/slug';
import type { QueryState } from '../../lib/url';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useProjectQueryState } from '../../hooks/useProjectQueryState';
import { useProjects } from '../../hooks/useProjects';
import { PageLayout } from '../../app/PageLayout';
import { Hero } from '../../components/layout/Hero';
import { Container } from '../../components/layout/Container';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { FeaturedProjects } from '../featured/FeaturedProjects';
import { ActiveFilters } from './ActiveFilters';
import { FilterPanel } from './FilterPanel';
import { FilterSheet } from './FilterSheet';
import { ProjectGrid } from './ProjectGrid';
import { ProjectList } from './ProjectList';
import { ResultsSkeleton } from './ResultsSkeleton';
import { ResultsToolbar } from './ResultsToolbar';
import { ShowMore } from './ShowMore';
import styles from './BrowsePage.module.css';

const PAGE_SIZE = 24;
const RESULTS_ID = 'results';

export function BrowsePage() {
  const data = useProjects();
  const { state, update: updateState } = useProjectQueryState();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const update = (patch: Partial<QueryState>) => {
    for (const key of [...FACET_KEYS, 'category', 'showBuggy'] as const) {
      if (key in patch && JSON.stringify(patch[key]) !== JSON.stringify(state[key])) {
        track('filter_change', { facet: key });
      }
    }
    if (patch.sort && patch.sort !== state.sort) track('sort_change', { sort: patch.sort });
    if (patch.view && patch.view !== state.view) track('view_change', { view: patch.view });
    updateState(patch);
  };

  // Search input: instant locally, debounced into the URL (and so into the results).
  const [input, setInput] = useState(state.q);
  const debouncedInput = useDebouncedValue(input, 150);
  const syncQuery = useEffectEvent((q: string) => {
    if (q !== state.q) update({ q });
  });
  useEffect(() => {
    syncQuery(debouncedInput);
  }, [debouncedInput]);

  const { q, category, topics, languages, resources, tech, showBuggy } = state;
  const filters = useMemo<Filters>(
    () => ({ q, category, topics, languages, resources, tech, showBuggy }),
    [q, category, topics, languages, resources, tech, showBuggy]
  );
  const all = data.projects;
  const filterCount = activeFilterCount(filters);
  const hasFilters = filterCount > 0 || state.q.trim() !== '';

  // Projects with known issues are out of everything below unless the display option is on.
  const shown = useMemo(() => all?.filter((p) => isVisible(p, showBuggy)) ?? null, [all, showBuggy]);
  const facets = useMemo(() => (all ? filterFacets(all, filters) : null), [all, filters]);
  const featured = useMemo(() => (all ? getFeaturedProjects(all) : []), [all]);
  const results = useMemo(
    () => (all ? sortProjects(filterProjects(all, filters), state.sort) : []),
    [all, filters, state.sort]
  );

  // Page size resets whenever the filters, search or sort change.
  const signature = JSON.stringify([filters, state.sort]);
  // "Show more" depth is kept on this history entry, so Back from a project page lands on the
  // same list; it only counts while the filters, search and sort are the ones it was saved for.
  const saved = (location.state as { browseLimit?: { signature: string; limit: number } } | null)?.browseLimit;
  const savedLimit = saved?.signature === signature ? saved.limit : PAGE_SIZE;
  const [limit, setLimit] = useState(savedLimit);
  const [seenSignature, setSeenSignature] = useState(signature);
  if (seenSignature !== signature) {
    setSeenSignature(signature);
    setLimit(PAGE_SIZE);
  }
  const visible = results.slice(0, limit);

  const saveLimit = useEffectEvent(() => {
    if (limit === savedLimit) return;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      {
        replace: true,
        preventScrollReset: true,
        state: { ...(location.state as object | null), browseLimit: { signature, limit } },
      }
    );
  });
  useEffect(() => {
    saveLimit();
  }, [limit, signature, savedLimit]); // savedLimit changes when this entry's state is replaced

  // One search event 1s after typing stops: whether there was a query and how many results, never the text.
  const sendSearch = useEffectEvent(() => {
    if (input.trim()) {
      track('search', { has_query: true, results: searchResultsBucket(results.length) });
    }
  });
  // Not before the data arrives, or a slow load would be recorded as "0 results".
  const loaded = all !== null;
  useEffect(() => {
    if (!input.trim() || !loaded) return;
    const timer = window.setTimeout(sendSearch, 1000);
    return () => window.clearTimeout(timer);
  }, [input, loaded]);

  // After "Show more", move focus to the first newly shown item.
  const focusIndex = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndex.current === null) return;
    document.querySelector<HTMLElement>(`[data-result-index="${focusIndex.current}"]`)?.focus();
    focusIndex.current = null;
  }, [limit]);

  // Links from before projects had pages: /?project=141 is now /projects/141-name.
  const legacyId = Number(searchParams.get('project'));
  const legacyProject = all && legacyId > 0 ? all.find((p) => p.id === legacyId) : undefined;
  useEffect(() => {
    if (legacyProject) navigate(projectPath(legacyProject), { replace: true });
  }, [legacyProject, navigate]);

  const clearAll = () => {
    setInput('');
    update({ q: '', ...CLEARED_VALUES });
  };

  const explore = () => {
    const heading = headingRef.current;
    if (!heading) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    heading.focus({ preventScroll: true });
  };

  const summary = !all
    ? ''
    : hasFilters
      ? `${formatNumber(results.length)} ${results.length === 1 ? 'project matches' : 'projects match'}`
      : `Showing ${formatNumber(visible.length)} of ${formatNumber(results.length)} projects · ${
          state.sort === 'new' ? 'newest first' : SORT_LABELS[state.sort]
        }`;

  return (
    <PageLayout skipTo={{ id: RESULTS_ID, label: 'Skip to projects' }}>
      <Hero projectCount={shown?.length ?? null} onExplore={explore} />
      <FeaturedProjects projects={featured} />
      <Container className={styles.layout}>
        <aside className={styles.filters} aria-label="Filters">
          {facets && <FilterPanel facets={facets} filters={filters} onChange={update} />}
        </aside>
        <section className={styles.results} aria-busy={data.status === 'loading'}>
          <h2 id={RESULTS_ID} ref={headingRef} tabIndex={-1} className={styles.heading}>
            Browse projects
          </h2>
          <ResultsToolbar
            query={input}
            onQueryChange={setInput}
            activeFilterCount={filterCount}
            onOpenFilters={() => setSheetOpen(true)}
            sort={state.sort}
            onSortChange={(sort) => update({ sort })}
            view={state.view}
            onViewChange={(view) => update({ view })}
          />
          <p className={styles.summary} aria-live="polite">
            {summary}
          </p>
          <ActiveFilters filters={filters} onChange={update} onClearAll={clearAll} />

          {data.status === 'loading' && <ResultsSkeleton view={state.view} />}
          {data.status === 'error' && (
            <EmptyState
              title="We couldn't load projects right now."
              description="Check your connection and try again."
              action={<Button onClick={data.retry}>Try again</Button>}
            />
          )}
          {data.status === 'success' && results.length === 0 && (
            <EmptyState
              title="No projects match that search."
              description="Try a different word, or clear your filters."
              action={<Button onClick={clearAll}>Clear filters</Button>}
            />
          )}
          {data.status === 'success' && results.length > 0 && (
            <>
              {state.view === 'grid' ? (
                <ProjectGrid projects={visible} activeCategory={state.category} />
              ) : (
                <ProjectList projects={visible} activeCategory={state.category} />
              )}
              {visible.length < results.length && (
                <ShowMore
                  onClick={() => {
                    focusIndex.current = visible.length;
                    setLimit((n) => n + PAGE_SIZE);
                  }}
                />
              )}
            </>
          )}
        </section>
      </Container>

      {sheetOpen && all && (
        <FilterSheet
          projects={all}
          filters={filters}
          onApply={(next) => {
            setInput(next.q);
            update(next);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </PageLayout>
  );
}
