import { isCategoryId } from './categories';
import { RESOURCE_GROUPS } from './endpoints';
import { DEFAULT_FILTERS, type FacetKey, type Filters } from './filter';
import { canonicalTopic } from './project';
import { DEFAULT_SORT, type SortOption } from './sort';

export type ViewMode = 'grid' | 'list';

export interface QueryState extends Filters {
  sort: SortOption;
  view: ViewMode;
}

export const DEFAULT_VIEW: ViewMode = 'grid';

/** Query param for each multi-select section. Values are comma-separated. */
const FACET_PARAMS: Record<FacetKey, string> = {
  topics: 'topic',
  languages: 'lang',
  resources: 'resource',
  tech: 'tech',
};

/** Spellings that older shared links may still carry, mapped to today's facet values. */
const RESOURCE_BY_LOWER = new Map<string, string>(RESOURCE_GROUPS.map((g) => [g.toLowerCase(), g]));
const CANONICAL: Partial<Record<FacetKey, (value: string) => string>> = {
  topics: canonicalTopic,
  resources: (value) => RESOURCE_BY_LOWER.get(value.toLowerCase()) ?? value,
};

function parseList(value: string | null, canonical?: (value: string) => string): string[] {
  const items = (value ?? '').split(',').map((item) => item.trim());
  return [...new Set(items.filter(Boolean).map((item) => canonical?.(item) ?? item))];
}

export function parseQueryState(search: string | URLSearchParams, defaultView: ViewMode = DEFAULT_VIEW): QueryState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const category = params.get('category') ?? '';
  const sort = params.get('sort');
  const view = params.get('view');
  return {
    q: params.get('q') ?? DEFAULT_FILTERS.q,
    category: isCategoryId(category) ? category : 'all',
    topics: parseList(params.get(FACET_PARAMS.topics), CANONICAL.topics),
    languages: parseList(params.get(FACET_PARAMS.languages)),
    resources: parseList(params.get(FACET_PARAMS.resources), CANONICAL.resources),
    tech: parseList(params.get(FACET_PARAMS.tech)),
    showBuggy: params.get('bugs') === '1',
    // anything else, including the retired ?sort=users and ?sort=popular, is the default
    sort: sort === 'az' ? 'az' : DEFAULT_SORT,
    view: view === 'grid' || view === 'list' ? view : defaultView,
  };
}

/** Serialises non-default values only, so a pristine page has a clean URL. */
export function serializeQueryState(state: QueryState, defaultView: ViewMode = DEFAULT_VIEW): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category !== 'all') params.set('category', state.category);
  for (const key of Object.keys(FACET_PARAMS) as FacetKey[]) {
    if (state[key].length > 0) params.set(FACET_PARAMS[key], state[key].join(','));
  }
  if (state.showBuggy) params.set('bugs', '1');
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.view !== defaultView) params.set('view', state.view);
  return params;
}
