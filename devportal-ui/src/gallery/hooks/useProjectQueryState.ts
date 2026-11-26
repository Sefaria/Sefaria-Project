import { useCallback, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { DEFAULT_VIEW, parseQueryState, serializeQueryState, type QueryState, type ViewMode } from '../lib/url';

const VIEW_KEY = 'pbs:view';

export function readStoredView(): ViewMode {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    return stored === 'list' || stored === 'grid' ? stored : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

function storeView(view: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // storage unavailable (private mode, blocked): the preference just isn't remembered
  }
}

export interface ProjectQueryApi {
  state: QueryState;
  /** Update filters, search, sort or view. Replaces history (no back-button spam). */
  update: (patch: Partial<QueryState>) => void;
}

/** URL is the source of truth for q, filters, sort and view. */
export function useProjectQueryState(): ProjectQueryApi {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const defaultView = useState(readStoredView)[0];
  const state = useMemo(() => parseQueryState(searchParams, defaultView), [searchParams, defaultView]);

  const update = useCallback<ProjectQueryApi['update']>(
    (patch) => {
      if (patch.view) storeView(patch.view);
      setSearchParams(serializeQueryState({ ...state, ...patch }, defaultView), {
        replace: true,
        preventScrollReset: true, // a filter/sort/search change must not jump back to the hero
        state: location.state,
      });
    },
    [state, defaultView, setSearchParams, location.state]
  );

  return { state, update };
}
