import { CATEGORIES, CATEGORY_META, type CategoryId } from './categories';
import type { Project } from './project';

export type CategoryFilter = CategoryId | 'all';

/** The multi-select sections. Within one section values are OR-ed. */
export type FacetKey = 'topics' | 'languages' | 'resources' | 'tech';
export const FACET_KEYS: readonly FacetKey[] = ['topics', 'languages', 'resources', 'tech'];

export interface Filters {
  q: string;
  category: CategoryFilter;
  topics: string[];
  languages: string[];
  resources: string[];
  /** "Built with": technologies from the stack description. */
  tech: string[];
  /** Display option, not a filter: include projects with known issues. */
  showBuggy: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  q: '',
  category: 'all',
  topics: [],
  languages: [],
  resources: [],
  tech: [],
  showBuggy: false,
};

/** What "Clear all" resets: every filter value, but not the search or the display option. */
export const CLEARED_VALUES: Pick<Filters, 'category' | FacetKey> = {
  category: 'all',
  topics: [],
  languages: [],
  resources: [],
  tech: [],
};

const FACET_VALUES: Record<FacetKey, (p: Project) => readonly string[]> = {
  topics: (p) => p.topics,
  languages: (p) => p.languages,
  resources: (p) => p.resourceGroups,
  tech: (p) => p.techMentions,
};

function searchHaystack(p: Project): string {
  return [
    p.name,
    p.description,
    ...p.topics,
    ...p.languages,
    ...p.categories.map((c) => CATEGORY_META[c].label),
    ...p.resources,
  ]
    .join('\n')
    .toLowerCase();
}

/** Case-insensitive substring search over name, description, topics, languages, category labels, resources. */
export function searchProjects(projects: readonly Project[], q: string): Project[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...projects];
  return projects.filter((p) => searchHaystack(p).includes(needle));
}

/** Projects with known issues are hidden unless the display option is on. */
export function isVisible(project: Project, showBuggy: boolean): boolean {
  return showBuggy || !project.isBuggy;
}

/**
 * Search first, then category ∧ topics ∧ languages ∧ resources ∧ built-with ∧
 * visibility. `skip` leaves one section out, which is how faceted counts avoid
 * zeroing the other options of a section when one of them is picked.
 */
export function filterProjects(
  projects: readonly Project[],
  filters: Filters,
  skip?: 'category' | FacetKey
): Project[] {
  return searchProjects(projects, filters.q).filter(
    (p) =>
      isVisible(p, filters.showBuggy) &&
      (skip === 'category' || filters.category === 'all' || p.categories.includes(filters.category)) &&
      FACET_KEYS.every((key) => {
        const selected = filters[key];
        if (key === skip || selected.length === 0) return true;
        const values = FACET_VALUES[key](p);
        return selected.some((value) => values.includes(value));
      })
  );
}

export type CategoryCounts = Record<CategoryFilter, number>;

/** Counts per category: every other filter and the search apply, the category selection does not. */
export function categoryCounts(projects: readonly Project[], filters: Partial<Filters>): CategoryCounts {
  const base = filterProjects(projects, { ...DEFAULT_FILTERS, ...filters }, 'category');
  const counts = { all: base.length } as CategoryCounts;
  for (const { id } of CATEGORIES) {
    counts[id] = base.filter((p) => p.categories.includes(id)).length;
  }
  return counts;
}

export interface FacetOption {
  value: string;
  count: number;
  selected: boolean;
}

/**
 * Options for one multi-select section, built from the data. Counts are faceted
 * (they ignore this section's own selection). An option with no matches is
 * dropped unless it is selected, so it can still be deselected. Sorted by
 * count, highest first, then A–Z.
 */
export function facetOptions(projects: readonly Project[], filters: Filters, key: FacetKey): FacetOption[] {
  const counts = new Map<string, number>();
  for (const p of projects) for (const value of FACET_VALUES[key](p)) counts.set(value, 0);
  for (const value of filters[key]) if (!counts.has(value)) counts.set(value, 0);
  for (const p of filterProjects(projects, filters, key)) {
    for (const value of new Set(FACET_VALUES[key](p))) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, selected: filters[key].includes(value) }))
    .filter((option) => option.count > 0 || option.selected)
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export interface FilterFacets {
  category: CategoryCounts;
  topics: FacetOption[];
  languages: FacetOption[];
  resources: FacetOption[];
  tech: FacetOption[];
}

export function filterFacets(projects: readonly Project[], filters: Filters): FilterFacets {
  return {
    category: categoryCounts(projects, filters),
    topics: facetOptions(projects, filters, 'topics'),
    languages: facetOptions(projects, filters, 'languages'),
    resources: facetOptions(projects, filters, 'resources'),
    tech: facetOptions(projects, filters, 'tech'),
  };
}

export interface ActiveValue {
  key: 'category' | FacetKey;
  value: string;
}

/** One entry per selected filter value, in panel order. Search and the display option are not values. */
export function activeFilterValues(filters: Filters): ActiveValue[] {
  return [
    ...(filters.category !== 'all' ? [{ key: 'category' as const, value: filters.category }] : []),
    ...FACET_KEYS.flatMap((key) => filters[key].map((value) => ({ key, value }))),
  ];
}

export function activeFilterCount(filters: Filters): number {
  return activeFilterValues(filters).length;
}
